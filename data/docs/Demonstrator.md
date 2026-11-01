# Demonstrator 25.10.26

## What needs to be caputred automatically?

- the dynamic part of the "context"
- two directions of viewing the context
    1. the physical part view
    2. the generated dataset view
- pysical part view
    - given a part, how was it manufactured?
- dataset view
    - given a sensor reading, what does it mean?

## Process Steps (implementierung Frank)

1. Load Sheet
2. Move to Oven
3. Heating
    - Pyrometer
4. Move to Press
5. Pressing
6. (Move to Inspection)
7. (Quality Check / Inspection)
    - Kamera
8. Move to Unload
9. Unload

## Sensor

- Winkel-, Kraft-, und Ausfahrsensor an jedem Greifer (8)
- 1 Pyrometer (?)
- Kamera

## Inputs

### Oven
- Ofen-Solltemperatur [°C]
    - pro IR field (bei Demonstrator sind alle gleich)
- Solltemperatur Temperiergerät 1 [°C]
    - globaler Prozessparameter
- Solltemperatur Temperiergerät 2 [°C]
    - globaler Prozessparameter
- Temperaturtoleranz [°C]
    - ab welcher Temperatur die Haltezeit gemessen wird
    - Delta unterhalb der Solltemperatur, ab der angefangen wird die Haltezeit zu messen
- Temperatur-Stabilitätszeit [s]
    - "Haltezeit": Die Zeit, die das Teil im Oven verbleibt, sobald die Wunschtemp (gemessen am Sheet auf der Oberfläche) erreicht ist

### Gripper
- Greifer-Zug-/Spannsollwert während des Pressens/Heizens
    - siehe Excel Georg
- Greifer-Haltesollwert
    - "wie stark soll gezogen werden, wenn nicht geheizt oder gepresst wird"
- Greiferpositionen — gewünschte Positionen der acht Greifer mit eindeutig definiertem Bezugssystem.
    - Referenzpunkt egal, kann umgerechnet werden -> also einfach "linke untere Ecke"

### Press
- Pressprofil — abstrakte Beschreibung des Pressablaufs, beispielsweise mit Anfahrbewegung, Pressgeschwindigkeit, Kraft- Wegvorgaben, Haltezeit und Rückhub.
    - wie bei Georg

### Kamera
- Position
    - im Raum X, Y, Z
    - Ausrichtung der Kamera (drei Winkel zum Referenzpunkt)
    - für jedes Bild hat man dann 6 Positionszahlen (die vordefiniert sind?)

> das Pressprofil muss aktuell noch per Hand konfiguriert werden