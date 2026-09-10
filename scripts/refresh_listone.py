#!/usr/bin/env python3
"""Refresh listone from Fantacalcio.it quotazioni page (teams, QA, FVM)."""
from __future__ import annotations

import html as htmlmod
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_JS = ROOT / "data" / "asta-data.js"
RAW = ROOT / "data" / "raw" / "quotazioni-fc.html"
URL = "https://www.fantacalcio.it/quotazioni-fantacalcio/2026-27"

SLUG = {
    "atalanta": "Atalanta",
    "bologna": "Bologna",
    "cagliari": "Cagliari",
    "como": "Como",
    "fiorentina": "Fiorentina",
    "frosinone": "Frosinone",
    "genoa": "Genoa",
    "inter": "Inter",
    "juventus": "Juventus",
    "lazio": "Lazio",
    "lecce": "Lecce",
    "milan": "Milan",
    "monza": "Monza",
    "napoli": "Napoli",
    "parma": "Parma",
    "roma": "Roma",
    "sassuolo": "Sassuolo",
    "torino": "Torino",
    "udinese": "Udinese",
    "venezia": "Venezia",
    "ata": "Atalanta",
    "bol": "Bologna",
    "cag": "Cagliari",
    "com": "Como",
    "fio": "Fiorentina",
    "fro": "Frosinone",
    "gen": "Genoa",
    "int": "Inter",
    "juv": "Juventus",
    "laz": "Lazio",
    "lec": "Lecce",
    "mil": "Milan",
    "mon": "Monza",
    "nap": "Napoli",
    "par": "Parma",
    "rom": "Roma",
    "sas": "Sassuolo",
    "tor": "Torino",
    "udi": "Udinese",
    "ven": "Venezia",
}
ROLE_MAP = {"p": "P", "d": "D", "c": "C", "a": "A"}
POS_MAP = {
    "por": "Por",
    "dc": "Dc",
    "dd": "Dd",
    "ds": "Ds",
    "b": "B",
    "e": "E",
    "m": "M",
    "c": "C",
    "w": "W",
    "t": "T",
    "a": "A",
    "pc": "Pc",
}
ROLE_FULL = {
    "P": "Portiere",
    "D": "Difensore",
    "C": "Centrocampista",
    "A": "Attaccante",
}
OVERRIDES = {
    "kean": {
        "status": "Titolare",
        "fascia": "Top",
        "consiglio": "Prima punta del Como: da puntare come secondo slot offensivo, alto potenziale gol.",
        "specialita": "Rigorista",
    }
}


def to_int(x):
    try:
        return int(float(str(x).replace(",", ".")))
    except Exception:
        return None


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", s.lower())).strip()


def parse_posizione(mantra: str) -> str:
    parts = [p for p in re.split(r"[|;,]+", mantra or "") if p]
    return ";".join(POS_MAP.get(p.lower(), p.capitalize()) for p in parts)


def fetch_html() -> str:
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_text(html, encoding="utf-8")
    return html


def parse_players(html: str):
    chunks = re.split(r'<tr class="player-row"', html)[1:]
    out = []
    for ch in chunks:
        mkw = re.search(r'data-filter-keywords="([^"]*)"', ch)
        mrole = re.search(r'data-filter-role-classic="([^"]*)"', ch)
        mmantra = re.search(r'data-filter-role-mantra="([^"]*)"', ch)
        mlink = re.search(r"/serie-a/squadre/([a-z0-9-]+)/", ch)
        mteam = re.search(r'class="player-team"[^>]*>\s*([A-Za-z]{3})\s*<', ch)
        nums = re.findall(
            r'class="player-classic-(?:initial-price|current-price|fvm)"[^>]*>\s*([0-9]+)',
            ch,
        )
        nome = htmlmod.unescape(mkw.group(1)).strip() if mkw else ""
        role = ROLE_MAP.get((mrole.group(1) if mrole else "").lower())
        if not nome or not role:
            continue
        squadra = SLUG.get(mlink.group(1) if mlink else "", "")
        if not squadra and mteam:
            squadra = SLUG.get(mteam.group(1).lower(), "")
        qa = to_int(nums[1]) if len(nums) > 1 else to_int(nums[0]) if nums else None
        fvm1000 = to_int(nums[2]) if len(nums) > 2 else None
        fvm504 = int(round(fvm1000 * 504 / 1000)) if fvm1000 is not None else None
        out.append(
            {
                "id": f"{nome}|{squadra}",
                "ruolo": role,
                "nome": nome,
                "squadra": squadra,
                "posizione": parse_posizione(mmantra.group(1) if mmantra else ""),
                "quotazione": qa,
                "fvm1000": fvm1000,
                "fvm504": fvm504,
            }
        )
    return out


def main():
    html = fetch_html()
    fresh = parse_players(html)
    payload = json.loads(DATA_JS.read_text(encoding="utf-8")[len("window.ASTA_DATA = ") :].rstrip().rstrip(";"))
    prev_by = {}
    for p in payload["players"]:
        prev_by.setdefault(norm(p["nome"]), []).append(p)

    players = []
    transfers = []
    for p in fresh:
        cands = prev_by.get(norm(p["nome"]), [])
        prev = next((c for c in cands if c.get("squadra") == p["squadra"]), cands[0] if cands else None)
        if prev and prev.get("squadra") and prev["squadra"] != p["squadra"]:
            transfers.append((p["nome"], prev["squadra"], p["squadra"]))
        p["status"] = (prev or {}).get("status", "")
        p["specialita"] = (prev or {}).get("specialita", "")
        p["consiglio"] = (prev or {}).get("consiglio", "")
        p["fascia"] = (prev or {}).get("fascia", "")
        p["pma"] = (prev or {}).get("pma")
        ov = OVERRIDES.get(norm(p["nome"]))
        if ov:
            p.update(ov)
        players.append(p)

    guide_extra = {}
    for tg in payload["teams"].values():
        for g in tg.get("giocatori", []):
            guide_extra.setdefault(norm(g["nome"]), g)

    for tname, tg in payload["teams"].items():
        new_gs = []
        for p in players:
            if p["squadra"] != tname:
                continue
            og = guide_extra.get(norm(p["nome"]), {})
            new_gs.append(
                {
                    "ruolo": og.get("ruolo") or ROLE_FULL[p["ruolo"]],
                    "nome": p["nome"],
                    "posizione": p["posizione"] or og.get("posizione", ""),
                    "status": p.get("status") or og.get("status", ""),
                    "quotazione": p["quotazione"],
                    "fvm504": p["fvm504"],
                    "fascia": p.get("fascia") or og.get("fascia", ""),
                    "specialita": p.get("specialita") or og.get("specialita", ""),
                    "consiglio": p.get("consiglio") or og.get("consiglio", ""),
                }
            )
        tg["giocatori"] = new_gs

    # Keep Kean as Como tip of attack in formazione
    como = payload["teams"].get("Como")
    if como and como.get("formazione"):
        parts = [p.strip() for p in como["formazione"].split(";")]
        if parts:
            atts = [n.strip() for n in parts[-1].split(",") if n.strip() and norm(n) != "kean"]
            parts[-1] = ", ".join(["Kean"] + atts) if False else "Kean"
            # for 4-2-3-1 last line is single ST
            if len(parts) >= 5:
                parts[-1] = "Kean"
            else:
                parts[-1] = ", ".join(["Kean"] + atts)
            como["formazione"] = "; ".join(parts)
    fio = payload["teams"].get("Fiorentina")
    if fio and fio.get("formazione"):
        rebuilt = []
        for part in fio["formazione"].split(";"):
            names = [n.strip() for n in part.split(",") if n.strip() and norm(n) != "kean"]
            if names:
                rebuilt.append(", ".join(names))
        fio["formazione"] = "; ".join(rebuilt)

    payload["players"] = players
    payload["meta"]["fonte"] = "Listone Fantacalcio.it 2026/27 aggiornato (squadre, QA, FVM)"
    from datetime import date

    payload["meta"]["listoneAggiornato"] = date.today().isoformat()
    DATA_JS.write_text(
        "window.ASTA_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Players: {len(players)}")
    print(f"Transfers detected: {len(transfers)}")
    for t in transfers[:20]:
        print(" -", t[0], ":", t[1], "->", t[2])
    kean = next(p for p in players if p["nome"] == "Kean")
    print("Kean:", kean["squadra"], "QA", kean["quotazione"], "FVM", kean["fvm504"])


if __name__ == "__main__":
    main()
