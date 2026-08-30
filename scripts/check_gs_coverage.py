"""
check_gs_coverage.py

Diagnostico rapido: compara los titulos de Grand Slam que detectamos en
el dataset (grand_slam_editions.csv, generado por 04_compute_match_load.py)
contra una lista real de titulos, para ver cuales faltan por falta de
cobertura del Match Charting Project.

Uso:
    python check_gs_coverage.py "Novak Djokovic"
"""
import sys
from pathlib import Path

import pandas as pd

OUT_DIR = Path(__file__).resolve().parent.parent / "output"

# Lista real de titulos de Grand Slam de Djokovic (24 al momento de
# escribir esto). Editar/agregar otros jugadores si hace falta.
REAL_TITLES = {
    "Novak Djokovic": [
        ("Australian Open", y) for y in [2008, 2011, 2012, 2013, 2015, 2016, 2019, 2020, 2021, 2023]
    ] + [
        ("Roland Garros", y) for y in [2016, 2021, 2023]
    ] + [
        ("Wimbledon", y) for y in [2011, 2014, 2015, 2018, 2019, 2021, 2022]
    ] + [
        ("US Open", y) for y in [2011, 2015, 2018, 2023]
    ],
    "Rafael Nadal": [
        ("Australian Open", y) for y in [2009, 2022]
    ] + [
        ("Roland Garros", y) for y in [2005, 2006, 2007, 2008, 2010, 2011, 2012, 2013, 2014, 2017, 2018, 2019, 2020, 2022]
    ] + [
        ("Wimbledon", y) for y in [2008, 2010]
    ] + [
        ("US Open", y) for y in [2010, 2013, 2017, 2019]
    ],
}


def main(player: str):
    path = OUT_DIR / "grand_slam_editions.csv"
    if not path.exists():
        print(f"No encontre {path}. Corre 04_compute_match_load.py primero.")
        sys.exit(1)

    df = pd.read_csv(path)
    player_rows = df[(df["player"] == player) & (df["won_title"] == True)]
    detected = set(zip(player_rows["tourney_name"], player_rows["year"]))

    real = set(REAL_TITLES.get(player, []))
    if not real:
        print(f"No tengo la lista real de titulos cargada para '{player}'.")
        print("Agregala a REAL_TITLES en este script para comparar.")
        return

    missing = sorted(real - detected, key=lambda x: x[1])
    extra = sorted(detected - real, key=lambda x: x[1])

    print(f"{player}: {len(detected)} titulos detectados en el dataset, {len(real)} reales.\n")

    if missing:
        print("Titulos reales que NO aparecen en el dataset (falta cobertura de charting):")
        for tourney, year in missing:
            print(f"  - {tourney} {year}")
    else:
        print("No falta ningun titulo real -- cobertura completa para este jugador.")

    if extra:
        print("\n(raro) Titulos detectados que no estan en la lista real -- revisar:")
        for tourney, year in extra:
            print(f"  - {tourney} {year}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Uso: python check_gs_coverage.py "Nombre del Jugador"')
        sys.exit(1)
    main(sys.argv[1])