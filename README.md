# Pipeline de datos ATP + clima

Corré esto en tu compu (no en el sandbox de Claude, que tiene internet
restringido). Necesitás Python 3.9+.

## Setup

```bash
pip install pandas numpy requests
```

## Orden de ejecución

```bash
cd scripts

# 1. Descarga partidos ATP (elegí el rango de años que quieras)
python 01_fetch_atp_matches.py --start-year 2018 --end-year 2025

# 2. Geocodifica cada torneo a lat/lon (revisá data/tournament_locations.csv
#    después -- puede haber algún torneo que no matcheó bien y haya que
#    ajustar el diccionario MANUAL_CITY_MAP a mano)
python 02_tournament_locations.py

# 3. Trae clima histórico por edición de torneo (tarda unos minutos,
#    hace una llamada por torneo-año a la API gratuita de Open-Meteo)
python 03_fetch_weather.py

# 4. Calcula todas las métricas (serve/return, Elo, win rate por
#    superficie, efecto agregado del clima)
python 04_compute_metrics.py
```

## Qué genera

En `output/`:
- `player_surface_stats.csv` — win rate por jugador y superficie
- `elo_current.csv` / `elo_history.csv` — ranking Elo propio
- `weather_effect_by_temp.csv` / `weather_effect_by_wind.csv` — efecto
  agregado del clima (aclarado como correlación, no causalidad)
- `matches_with_weather.csv` — dataset completo partido + clima del día

## Próximo paso

Con esto ya tenés el dataset. El siguiente script (05, todavía no armado)
tomaría estos CSVs y los convertiría al JSON que consume `src/data.js`
del template React, más una función de proyección usando el forecast de
16 días de Open-Meteo (`fetch_forecast_weather` en el script 03, ya
implementada, lista para usar).

## Nota sobre el diccionario de ciudades

`02_tournament_locations.py` trae un diccionario manual con los ~50
torneos más comunes. Cuando corras el pipeline con tus años elegidos, va
a haber algunos nombres de torneo que no maticheen (torneos que cambiaron
de sede, nombres raros del dataset, etc.) — el script te va a avisar
cuántos quedaron sin geocodificar al final, para que los completes.
