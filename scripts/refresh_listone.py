#!/usr/bin/env python3
"""Refresh listone from Fantacalcio.it quotazioni page (teams, QA, FVM Classic+Mantra)."""
from __future__ import annotations

import html as htmlmod
import json
import re
import unicodedata
import urllib.request
from datetime import date
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
FALLBACK_MANTRA = {"P": ["Por"], "D": ["Dc"], "C": ["C"], "A": ["Pc"]}
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


def parse_mantra_roles(mantra: str) -> list[str]:
    parts = [p for p in re.split(r"[|;,]+", mantra or "") if p]
    roles = [POS_MAP.get(p.lower(), p.capitalize()) for p in parts]
    return roles or []


def parse_posizione(mantra: str) -> str:
    return ";".join(parse_mantra_roles(mantra))


def scale_fvm(fvm1000: int | None, budget: int) -> int | None:
    if fvm1000 is None:
        return None
    return int(round(fvm1000 * budget / 1000))


def fetch_html() -> str:
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_text(html, encoding="utf-8")
    return html


def parse_players(html: str, budget: int):
    chunks = re.split(r'<tr class="player-row"', html)[1:]
    out = []
    for ch in chunks:
        mkw = re.search(r'data-filter-keywords="([^"]*)"', ch)
        mrole = re.search(r'data-filter-role-classic="([^"]*)"', ch)
        mmantra = re.search(r'data-filter-role-mantra="([^"]*)"', ch)
        mlink = re.search(r"/serie-a/squadre/([a-z0-9-]+)/", ch)
        mteam = re.search(r'class="player-team"[^>]*>\s*([A-Za-z]{3})\s*<', ch)
        classic = re.findall(
            r'class="player-classic-(?:initial-price|current-price|fvm)"[^>]*>\s*([0-9]+)',
            ch,
        )
        mantra_nums = re.findall(
            r'class="player-mantra-(?:initial-price|current-price|fvm)"[^>]*>\s*([0-9]+)',
            ch,
        )
        nome = htmlmod.unescape(mkw.group(1)).strip() if mkw else ""
        role = ROLE_MAP.get((mrole.group(1) if mrole else "").lower())
        if not nome or not role:
            continue
        squadra = SLUG.get(mlink.group(1) if mlink else "", "")
        if not squadra and mteam:
            squadra = SLUG.get(mteam.group(1).lower(), "")
        qa = to_int(classic[1]) if len(classic) > 1 else to_int(classic[0]) if classic else None
        fvm1000 = to_int(classic[2]) if len(classic) > 2 else None
        qa_m = to_int(mantra_nums[1]) if len(mantra_nums) > 1 else qa
        fvm_m1000 = to_int(mantra_nums[2]) if len(mantra_nums) > 2 else fvm1000
        mantra_raw = mmantra.group(1) if mmantra else ""
        mantra_roles = parse_mantra_roles(mantra_raw) or FALLBACK_MANTRA.get(role, ["C"])
        out.append(
            {
                "id": f"{nome}|{squadra}",
                "ruolo": role,
                "nome": nome,
                "squadra": squadra,
                "posizione": parse_posizione(mantra_raw) or ";".join(mantra_roles),
                "mantraRoles": mantra_roles,
                "quotazione": qa,
                "fvm1000": fvm1000,
                "fvm504": scale_fvm(fvm1000, budget),
                "quotazioneMantra": qa_m,
                "fvmMantra1000": fvm_m1000,
                "fvmMantra504": scale_fvm(fvm_m1000, budget),
            }
        )
    return out


def main():
    html = fetch_html()
    payload = json.loads(DATA_JS.read_text(encoding="utf-8")[len("window.ASTA_DATA = ") :].rstrip().rstrip(";"))
    budget = int(payload.get("meta", {}).get("creditiIniziali") or 500)
    fresh = parse_players(html, budget)

    prev_by = {}
    for p in payload["players"]:
        prev_by.setdefault(norm(p["nome"]), []).append(p)

    players = []
    transfers = []
    qa_changes = 0
    fvm_changes = 0
    for p in fresh:
        cands = prev_by.get(norm(p["nome"]), [])
        prev = next((c for c in cands if c.get("squadra") == p["squadra"]), cands[0] if cands else None)
        if prev and prev.get("squadra") and prev["squadra"] != p["squadra"]:
            transfers.append((p["nome"], prev["squadra"], p["squadra"]))
        if prev:
            if prev.get("quotazione") != p.get("quotazione"):
                qa_changes += 1
            if prev.get("fvm1000") != p.get("fvm1000"):
                fvm_changes += 1
            for key in ("status", "specialita", "consiglio", "fascia", "pma"):
                if prev.get(key) not in (None, ""):
                    p[key] = prev[key]
            if not p.get("mantraRoles") and prev.get("mantraRoles"):
                p["mantraRoles"] = prev["mantraRoles"]
        else:
            p.setdefault("status", "")
            p.setdefault("specialita", "")
            p.setdefault("consiglio", "")
            p.setdefault("fascia", "")
            p.setdefault("pma", None)
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
    payload["meta"]["fonte"] = "Listone Fantacalcio.it 2026/27 aggiornato (squadre, QA, FVM Classic+Mantra)"
    payload["meta"]["listoneAggiornato"] = date.today().isoformat()
    DATA_JS.write_text(
        "window.ASTA_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Players: {len(players)} (budget scale {budget})")
    print(f"QA changed: {qa_changes} · FVM changed: {fvm_changes}")
    print(f"Transfers detected: {len(transfers)}")
    for t in transfers[:20]:
        print(" -", t[0], ":", t[1], "->", t[2])
    for name in ("Kean", "Thuram", "Malen", "Martinez L."):
        hits = [p for p in players if p["nome"] == name]
        for p in hits:
            print(
                f"{p['nome']}|{p['squadra']} QA {p['quotazione']} FVM {p['fvm504']} "
                f"Mantra QA {p['quotazioneMantra']} FVM {p['fvmMantra504']} roles {p['mantraRoles']}"
            )


if __name__ == "__main__":
    main()
