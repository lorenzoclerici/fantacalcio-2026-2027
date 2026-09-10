#!/usr/bin/env python3
"""Extract auction data from the Excel workbook into data/asta-data.js"""
import zipfile
import xml.etree.ElementTree as ET
import re
import json
import os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "Asta_Fantacalcio_2026_barratura_automatica.xlsx")
OUT_DIR = os.path.join(ROOT, "data")
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def parse_sheet(z, path):
    root = ET.fromstring(z.read(path))
    data = {}
    for row in root.find("m:sheetData", NS).findall("m:row", NS):
        for c in row.findall("m:c", NS):
            ref = c.attrib["r"]
            v = c.find("m:v", NS)
            is_ = c.find("m:is", NS)
            val = None
            if is_ is not None:
                texts = [
                    t_.text or ""
                    for t_ in is_.iter(
                        "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"
                    )
                ]
                val = "".join(texts)
            elif v is not None:
                val = v.text
            if val is not None:
                data[ref] = val
    return data


def grid_from(data):
    grid = defaultdict(dict)
    for ref, val in data.items():
        m = re.match(r"([A-Z]+)(\d+)", ref)
        grid[int(m.group(2))][m.group(1)] = val
    return grid


def to_int(x):
    if x is None or x == "":
        return None
    try:
        return int(float(x))
    except ValueError:
        return None


def clean_name(s):
    if not s:
        return s
    return "".join(ch for ch in s if ord(ch) != 0x0336)


def sheet_path(target):
    target = target.lstrip("/")
    if target.startswith("worksheets/"):
        return "xl/" + target
    if not target.startswith("xl/"):
        return "xl/" + target
    return target


def main():
    z = zipfile.ZipFile(XLSX)
    sup = grid_from(parse_sheet(z, "xl/worksheets/sheet25.xml"))
    players = []
    for r in sorted(sup):
        row = sup[r]
        a = row.get("A")
        if a not in ("P", "D", "C", "A") or not row.get("B"):
            continue
        players.append(
            {
                "id": f"{row.get('B')}|{row.get('C')}",
                "ruolo": a,
                "nome": clean_name(row.get("B")),
                "squadra": row.get("C"),
                "posizione": row.get("D") or "",
                "status": row.get("E") or "",
                "quotazione": to_int(row.get("F")),
                "fvm1000": to_int(row.get("G")),
                "fvm504": to_int(row.get("H")),
                "specialita": row.get("I") or "",
            }
        )

    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
    sheets_meta = []
    for s in wb.find("m:sheets", NS):
        rid = s.attrib[
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        ]
        sheets_meta.append((s.attrib["name"], sheet_path(rid_to[rid])))

    skip = {"Asta", "Listone", "Istruzioni", "Riepilogo squadre", "_Supporto Listone"}
    team_guides = {}
    for name, path in sheets_meta:
        if name in skip:
            continue
        g = grid_from(parse_sheet(z, path))
        meta = {
            "nome": name,
            "allenatore": g.get(3, {}).get("B", ""),
            "modulo": g.get(3, {}).get("D", ""),
            "formazione": g.get(4, {}).get("B", ""),
            "ballottaggi": g.get(5, {}).get("B", ""),
            "rigoristi": g.get(6, {}).get("B", ""),
            "piazzati": g.get(6, {}).get("D", ""),
            "giocatori": [],
        }
        for r in range(9, 50):
            row = g.get(r, {})
            if not row.get("B"):
                continue
            meta["giocatori"].append(
                {
                    "ruolo": row.get("A", ""),
                    "nome": clean_name(row.get("B", "")),
                    "posizione": row.get("C", ""),
                    "status": row.get("D", ""),
                    "quotazione": to_int(row.get("E")),
                    "fvm504": to_int(row.get("F")),
                    "fascia": row.get("G", ""),
                    "specialita": row.get("H", ""),
                    "consiglio": row.get("I", ""),
                }
            )
        team_guides[name] = meta

    consigli, fasce, specs = {}, {}, {}
    for tg in team_guides.values():
        for gp in tg["giocatori"]:
            key = gp["nome"]
            if gp.get("consiglio"):
                consigli[key] = gp["consiglio"]
            if gp.get("fascia"):
                fasce[key] = gp["fascia"]
            if gp.get("specialita"):
                specs[key] = gp["specialita"]

    for p in players:
        p["consiglio"] = consigli.get(p["nome"], "")
        p["fascia"] = fasce.get(p["nome"], "")
        if not p["specialita"] and p["nome"] in specs:
            p["specialita"] = specs[p["nome"]]

    payload = {
        "meta": {
            "titolo": "Asta Fantacalcio 2026/27",
            "creditiIniziali": 504,
            "rosa": {"P": 4, "D": 9, "C": 9, "A": 7},
            "fonte": "Listone Fantacalcio.it 2026/27 · Probabili aggiornate 03/09/2026",
        },
        "fantallenatori": [
            "Simone",
            "Giacomo",
            "Niko",
            "Quici",
            "Fratello Quici",
            "Nicolò",
            "Vi",
            "Lore",
            "Robbo",
            "Ale",
        ],
        "players": players,
        "teams": team_guides,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    js_path = os.path.join(OUT_DIR, "asta-data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.ASTA_DATA = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"Wrote {js_path} ({os.path.getsize(js_path)} bytes)")
    print(f"Players: {len(players)} | Teams: {len(team_guides)}")


if __name__ == "__main__":
    main()
