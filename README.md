# 🏁 MONSTER V8

Jeu de parcours arcade en **2.5D** dans un univers **Miami vaporwave**, jouable au clavier, sur tablette et sur mobile, directement dans le navigateur.

▶ **Jouer :** https://firetaleshy.github.io/MONSTERV8/

## 4 mondes, 4 véhicules, 20 parcours

| Monde | Véhicule | Ambiance | Caractère |
|---|---|---|---|
| 1 · Ocean Drive | **Moto** sportive | plage, palmiers, soleil rétro | légère et nerveuse, wheelies faciles, attention à la tête |
| 2 · Neon Junkyard | **Monster truck** (coupé V8) | casse néon | écrase tout, vole haut |
| 3 · Midnight Touge | **Honda Civic Type R** hatchback bas, tuning vert + LED | nuit, skyline néon | rapide et précise, aileron, néons verts, son VTEC |
| 4 · Chrome Highway | **Camion** (tracteur + remorque) | désert au crépuscule | lourd, lent à lancer, difficile à retourner |

Chaque monde compte **5 parcours courts** (15 à 40 s) façon parkour : sauts au-dessus du vide, plateaux en descente, escaliers, falaises, rangées de véhicules à survoler, **pads de boost** et pièces à collecter. Chaque parcours se débloque en terminant le précédent ; 3 étoiles par parcours.

### ☠️ Un crash fait exploser le véhicule et fait perdre le parcours
Toit au sol, réception ratée, véhicule retourné, chute dans le vide / l'eau / la lave : **BOOM**, écran de défaite, on recommence. Après 3 échecs sur un parcours, un bouton permet de le passer.

## Commandes

| Action | Clavier | Mobile / tablette |
|---|---|---|
| Gaz | `↑` / `W` | bouton GAZ |
| Frein / marche arrière | `↓` / `S` | bouton ◀ |
| Rotation en l'air (flips) | `←` `→` / `A` `D` | boutons ⟲ ⟳ |
| Nitro | `Espace` / `Maj` | bouton NITRO |
| Recommencer | `R` | |
| Pause / Son | `P` ou `Échap` / `M` | ⏸ / 🔊 |

Chaque véhicule a sa peinture d'origine (la Civic est verte) ; 6 autres peintures au choix. Boutons tactiles proportionnels à l'écran, multi-touch, plein écran ⛶, portrait ou paysage, installable sur l'écran d'accueil (iPad : *Partager → Sur l'écran d'accueil*).

## Technique

JavaScript pur + `<canvas>`, **aucune dépendance, aucun build**. Physique maison à suspensions, quatre profils de véhicule (inertie, puissance, contrôle en l'air, collision), assistances arcade (redressement en l'air, bords de falaise), sons synthétisés (Web Audio : V8, moto, VTEC, diesel, explosion). Rendu 2.5D : piste à voies, roues du côté éloigné, carrosserie extrudée, ombres, parallaxe, premier plan.

```
index.html           page + écrans (titre, mondes, niveaux, pause, victoire, défaite)
style.css            menus Miami vaporwave
js/vehicles.js       les 4 véhicules : paramètres physiques + dessin
js/levels.js         4 mondes × 5 parcours générés par segments
js/audio.js          moteurs, nitro, écrasements, explosion
js/game.js           physique, rendu, HUD, logique de jeu, menus
manifest.webmanifest, icon*.png   installation sur l'écran d'accueil
```

## Lancer en local

Ouvrir `index.html` dans un navigateur, ou `python3 -m http.server` puis http://localhost:8000.

## Publier sur GitHub Pages

*Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`*.
