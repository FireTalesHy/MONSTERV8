# 🏁 MONSTER V8

Jeu de parcours arcade en **2.5D** dans un univers **Miami vaporwave**, jouable au clavier, sur tablette et sur mobile, directement dans le navigateur.

▶ **Jouer :** https://firetaleshy.github.io/MONSTERV8/

## 4 mondes, 4 véhicules, 40 parcours

| Monde | Véhicule | Ambiance | Caractère |
|---|---|---|---|
| 1 · Ocean Drive | **Moto** sportive | plage, palmiers, soleil rétro | légère et nerveuse, wheelies faciles, attention à la tête |
| 2 · Neon Junkyard | **Monster truck** (coupé V8) | casse néon | écrase tout, vole haut |
| 3 · Midnight Touge | **Honda Civic Type R** hatchback bas, tuning vert + LED | nuit, skyline néon | rapide et précise, aileron, néons verts, son VTEC |
| 4 · Chrome Highway | **Camion** (tracteur + remorque) | désert au crépuscule | lourd, lent à lancer, difficile à retourner |

Chaque monde compte **10 parcours courts** façon parkour (≈ 15 à 40 s), de plus en plus durs : sauts au-dessus du vide, plateaux en descente, escaliers, falaises, rangées de véhicules à survoler…

### Éléments de parcours
- **Pads de boost** : accélèrent au passage.
- **Tremplins à ressort** : propulsent le véhicule par-dessus un gouffre ou sur un plateau.
- **Anneaux de feu** : à traverser en plein saut pour des points (dessinés en 2.5D, on passe *dedans*).
- **Barils de TNT** : l'explosion soulève le véhicule sans le détruire.
- **Bidons de nitro** : le seul moyen de recharger le boost.

### Nitro
Le nitro est un **boost de 2 secondes** déclenché d'une pression (Espace, clic / tap sur l'écran ou bouton NITRO). Chaque boost consomme **un bidon** ; on en porte 2 (plus avec le garage) et on les recharge en ramassant les bidons N2O posés sur le parcours.

### ☠️ Un crash fait exploser le véhicule et fait perdre le parcours
Toit au sol, réception ratée, véhicule retourné, chute dans le vide / l'eau / la lave : **BOOM**, on recommence. Après 3 échecs sur un parcours, un bouton permet de le passer.

### Progression
- **Étoiles** : 1 à l'arrivée, puis 2 paliers de score par parcours.
- **Crédits** : pièces V8 (10 chacune, même en cas de crash), score des parcours terminés, nouvelles étoiles, défis du jour et trophées.
- **Garage** (façon Hill Climb Racing) : pour chaque véhicule, 5 niveaux de **moteur**, **suspension**, **adhérence** et **nitro**.
- **Fantôme** (façon Trials) : ton meilleur temps sur chaque parcours roule à côté de toi.
- **Défi du jour** : un parcours généré à partir de la date, avec un véhicule imposé ; bonus de crédits la première fois.
- **20 trophées** (premier flip, 300 obstacles écrasés, 50 anneaux, mondes terminés, 120 étoiles…).

## Commandes

| Action | Clavier | Mobile / tablette |
|---|---|---|
| Gaz | `↑` / `W` | bouton GAZ |
| Frein / marche arrière | `↓` / `S` | bouton ◀ |
| Rotation en l'air (flips) | `←` `→` / `A` `D` | boutons ⟲ ⟳ |
| Boost nitro (2 s) | `Espace` / `Maj` / clic | bouton NITRO ou tap sur l'écran |
| Recommencer | `R` | |
| Pause / Son | `P` ou `Échap` / `M` | ⏸ / 🔊 |

Boutons tactiles proportionnels à l'écran, multi-touch, plein écran ⛶, portrait ou paysage, installable sur l'écran d'accueil (iPad : *Partager → Sur l'écran d'accueil*).

## Technique

JavaScript pur + `<canvas>`, **aucune dépendance, aucun build**. Physique maison à suspensions, quatre profils de véhicule, assistances arcade (redressement en l'air, bords de falaise, chocs plafonnés), sons synthétisés (Web Audio). Les 40 parcours sont générés par segments à partir d'une graine fixe ; leur faisabilité et leurs seuils d'étoiles sont vérifiés par simulation.

```
index.html           page + écrans (titre, mondes, parcours, garage, trophées, pause, victoire, défaite)
style.css            menus Miami vaporwave
js/vehicles.js       les 4 véhicules : paramètres physiques + dessin
js/levels.js         4 mondes × 10 parcours + défi du jour, générés par segments
js/audio.js          moteurs, nitro, ressorts, anneaux, explosions…
js/game.js           physique, rendu, HUD, garage, trophées, menus
manifest.webmanifest, icon*.png   installation sur l'écran d'accueil
```

La progression est enregistrée dans le navigateur (`localStorage`) ; les anciennes sauvegardes (20 parcours) sont reprises automatiquement.

## Lancer en local

Ouvrir `index.html` dans un navigateur, ou `python3 -m http.server` puis http://localhost:8000.
