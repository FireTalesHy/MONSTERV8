# 🏁 MONSTER V8

Un jeu de monster truck arcade en **2.5D**, jouable au clavier, sur tablette et sur mobile, directement dans le navigateur : un **coupé américain V8** sur de gros pneus, des voitures à écraser, des rampes géantes, des flips et du nitro.

▶ **Jouer :** https://firetaleshy.github.io/MONSTERV8/

## Commandes

| Action | Clavier | Mobile |
|---|---|---|
| Gaz | `↑` / `W` | bouton GAZ |
| Frein / marche arrière | `↓` / `S` | bouton ◀ |
| Rotation en l'air (flips) | `←` `→` / `A` `D` | boutons ⟲ ⟳ |
| Nitro | `Espace` / `Maj` | bouton NITRO |
| Dernier checkpoint | `R` | |
| Pause / Son | `P` ou `Échap` / `M` | ⏸ / 🔊 |

## Tablette & mobile

- Boutons tactiles proportionnels à l'écran (téléphone → iPad), **multi-touch** : gaz + inclinaison + nitro en même temps.
- Paysage ou portrait, bouton **plein écran** ⛶, résolution adaptée automatiquement si l'appareil rame.
- Installable comme une appli : *Partager → Sur l'écran d'accueil* (iPad) ou *Installer* (Android/Chrome), lancement en plein écran paysage.

## Le jeu

- 6 niveaux : Ferraille Park, Boue & Marais, Stade des Rampes, Mont Glacé, Volcan en Fusion, Arène Finale.
- Écrase les véhicules, ramasse les pièces V8, enchaîne sauts, flips (avant/arrière) et wheelies pour faire monter le **combo** (jusqu'à x5).
- Réceptionne sur les roues pour valider tes figures ; un atterrissage sur le toit annule le combo.
- 3 étoiles par niveau (arrivée, puis deux paliers de score) ; les niveaux se débloquent un par un.
- Choix de la peinture dans le menu. Progression sauvegardée dans le navigateur (`localStorage`).
- Moteur V8 synthétisé en direct (Web Audio) : pas de fichier audio, pas d'image.

## Technique

JavaScript pur + `<canvas>`, **aucune dépendance, aucun build**. Rendu 2.5D : physique en 2D, mais piste à plusieurs voies, roues du côté éloigné, carrosserie extrudée, ombres, décor étagé en parallaxe, premier plan et vignettage. Physique maison (suspensions à ressorts, collisions sur terrain, gravité allégée) réglée pour le plaisir plutôt que pour le réalisme.

```
index.html     page + écrans (menu, niveaux, pause, résultats)
manifest.webmanifest, icon*.png   installation sur l'écran d'accueil
style.css      interface
js/levels.js   générateur de terrain et définition des 6 niveaux
js/audio.js    sons (moteur V8, nitro, écrasements…)
js/game.js     physique, rendu, HUD, logique de jeu
```

## Lancer en local

Ouvrir `index.html` dans un navigateur, ou `python3 -m http.server` puis http://localhost:8000.

## Publier sur GitHub Pages

*Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`*.
