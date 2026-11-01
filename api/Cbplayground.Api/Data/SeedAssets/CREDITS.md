# Image credits

The cover images and area photos of the demo restaurants are real photos under **CC0 1.0** (Creative Commons Public Domain Dedication,
https://creativecommons.org/publicdomain/zero/1.0/): free to use, also commercially, changed or unchanged, without attribution.
They were taken from Wikimedia Commons, which was reachable from the development environment, while Unsplash, Pexels and Pixabay
blocked automated access. The credits below are given anyway. Faces in the foreground and visible brands were avoided or
cut off or blurred where possible.

The floor plans (`gaststube.webp`, `terrasse.webp`, `sala.webp`, `rooftop.webp`, `lounge.webp`) were rendered for this project:
no free floor plan of a restaurant without loose tables and chairs was found, so each room was modelled as a top view in
Blender 4.2 LTS (Cycles renderer) with materials and models under CC0 1.0, listed below. Blender's licence (GPL) does not cover
the images rendered with it. The logos (`*-logo.png`) were designed for this project as SVG, with fonts under the SIL Open Font
License 1.1, and rendered as PNG with resvg; the OFL allows images made with the fonts. No material from Freepik, Shutterstock
or Envato, nothing of unclear licence, no logos or brands of others.

## Materials, models and fonts used in the floor plans and logos

All retrieved on 2026-11-01.

Materials from ambientCG (https://ambientcg.com), author ambientCG (Lennart Demes), licence CC0 1.0
(https://docs.ambientcg.com/license/), each the 1K JPG set (colour, normal and roughness maps), page `https://ambientcg.com/view?id=<name>`:

- `WoodFloor051`: plank floor of the Gaststube, podium of the Sala
- `Tiles036`: tiled stove of the Gaststube (recoloured green)
- `Wood049`: benches, counter top and barrel of the Gaststube, round bench of the Terrasse
- `Wood066`: bar counters and back bars
- `Fabric030`: cushions and sofas (recoloured)
- `Tiles139`: floor of the Sala, floor behind the bars
- `Tiles098`: stone slabs of the Terrasse
- `Grass004`: lawn of the Terrasse
- `Gravel038`: tree bed, soil of the hedges and planters
- `Marble015`: marble bar counters
- `Planks029L`: wooden deck of the Rooftop
- `Gravel043`: roof gravel of the Rooftop
- `Concrete034`: stair and lift core, steps and planters of the Rooftop
- `WoodFloor034`: herringbone parquet of the Lounge

Models from Poly Haven (https://polyhaven.com), licence CC0 1.0 (https://polyhaven.com/license), page `https://polyhaven.com/a/<name>`:

- `potted_plant_01` (Rico Cilliers): potted plants
- `potted_plant_02` (Rico Cilliers): potted plants
- `calathea_orbifolia_01` (Rob Tuytel, Rico Cilliers): potted plant in the Lounge
- `shrub_01` (Rico Cilliers): hedges and planters
- `jacaranda_tree` (Rob Tuytel, Rico Cilliers): the chestnut of the Terrasse
- `tree_small_02` (Rico Cilliers): olive trees on the Rooftop
- `metal_stool_02` (Ulan Cabanilla): bar stools

Fonts from Google Fonts (https://fonts.google.com), licence SIL Open Font License 1.1 (https://openfontlicense.org):

- Montserrat (Julieta Ulanovsky and contributors): label "Blick auf den Stephansdom" on the Rooftop, logo of Rooftop Belvedere
- Cormorant Garamond (Christian Thalmann): logo of Rooftop Belvedere
- Merriweather (Sorkin Type) and Open Sans (Steve Matteson): logo of Gasthaus zur Linde
- Playfair Display (Claus Eggers Sørensen) and Source Sans 3 (Paul D. Hunt): logo of Kafana Dunav

## `gaststube.webp`

- Motif: Floor plan of the area "Gaststube" (Gasthaus zur Linde), top view of a room of 11.8 × 7.5 m: plank floor, tiled stove with its bench, corner bench, bar with stools, entrance, windows
- Source: rendered for this project with Blender 4.2 LTS (Cycles) from a scene modelled for it; uses the materials `WoodFloor051`, `Tiles036`, `Wood049`, `Wood066`, `Fabric030`, `Tiles139`; models `metal_stool_02`, `potted_plant_01`, `potted_plant_02` (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: materials and models CC0 1.0, font SIL Open Font License 1.1
- Retrieved: 2026-11-01 (materials, models and fonts)
- Changes: textures brightened and partly recoloured, models scaled and placed; rendered at 1800 × 1200 pixels, denoised, saved as WebP

## `terrasse.webp`

- Motif: Floor plan of the area "Terrasse" (Gasthaus zur Linde), top view of 13 × 8 m of stone slabs between the house and the hedges, the chestnut with a round bench
- Source: rendered for this project with Blender 4.2 LTS (Cycles) from a scene modelled for it; uses the materials `Tiles098`, `Grass004`, `Gravel038`, `Wood049`; models `jacaranda_tree`, `shrub_01`, `potted_plant_01` (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: materials and models CC0 1.0, font SIL Open Font License 1.1
- Retrieved: 2026-11-01 (materials, models and fonts)
- Changes: textures brightened and partly recoloured, models scaled and placed; rendered at 1800 × 1200 pixels, denoised, saved as WebP

## `sala.webp`

- Motif: Floor plan of the area "Sala" (Kafana Dunav), top view of a room of 13.8 × 8.8 m: tiles, bar with a marble counter and stools, podium for the musicians, wall bench, entrance, windows
- Source: rendered for this project with Blender 4.2 LTS (Cycles) from a scene modelled for it; uses the materials `Tiles139`, `Wood066`, `Marble015`, `WoodFloor051`, `Wood049`, `Fabric030`; models `metal_stool_02`, `potted_plant_01`, `potted_plant_02` (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: materials and models CC0 1.0, font SIL Open Font License 1.1
- Retrieved: 2026-11-01 (materials, models and fonts)
- Changes: textures brightened and partly recoloured, models scaled and placed; rendered at 1800 × 1200 pixels, denoised, saved as WebP

## `rooftop.webp`

- Motif: Floor plan of the area "Rooftop" (Rooftop Belvedere), top view of a wooden deck of 16 × 10 m behind a glass balustrade: stairs and lift, bar with stools, planters, olive trees, the view to the Stephansdom
- Source: rendered for this project with Blender 4.2 LTS (Cycles) from a scene modelled for it; uses the materials `Planks029L`, `Gravel043`, `Concrete034`, `Wood066`, `Marble015`, `Gravel038`; models `metal_stool_02`, `shrub_01`, `tree_small_02`; font Montserrat (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: materials and models CC0 1.0, font SIL Open Font License 1.1
- Retrieved: 2026-11-01 (materials, models and fonts)
- Changes: textures brightened and partly recoloured, models scaled and placed; rendered at 1800 × 1200 pixels, denoised, saved as WebP

## `lounge.webp`

- Motif: Floor plan of the area "Lounge" (Rooftop Belvedere), top view of a room of 13 × 8.2 m: herringbone parquet, panorama windows, two sofas, small bar, entrance
- Source: rendered for this project with Blender 4.2 LTS (Cycles) from a scene modelled for it; uses the materials `WoodFloor034`, `Fabric030`, `Wood066`, `Marble015`; models `metal_stool_02`, `potted_plant_01`, `potted_plant_02`, `calathea_orbifolia_01` (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: materials and models CC0 1.0, font SIL Open Font License 1.1
- Retrieved: 2026-11-01 (materials, models and fonts)
- Changes: textures brightened and partly recoloured, models scaled and placed; rendered at 1800 × 1200 pixels, denoised, saved as WebP

## `zur-linde-logo.png`

- Motif: Logo of Gasthaus zur Linde: a linden leaf in a ring, "Gasthaus zur Linde" in green
- Source: designed for this project as SVG and rendered as PNG with resvg, transparent background; fonts Merriweather, Open Sans (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: fonts SIL Open Font License 1.1
- Retrieved: 2026-11-01 (fonts)
- Changes: none after rendering; cropped to the content and scaled to 800 pixels wide

## `kafana-dunav-logo.png`

- Motif: Logo of Kafana Dunav: a bridge over the Danube in a blue circle, "Kafana Dunav" in blue
- Source: designed for this project as SVG and rendered as PNG with resvg, transparent background; fonts Playfair Display, Source Sans 3 (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: fonts SIL Open Font License 1.1
- Retrieved: 2026-11-01 (fonts)
- Changes: none after rendering; cropped to the content and scaled to 800 pixels wide

## `rooftop-belvedere-logo.png`

- Motif: Logo of Rooftop Belvedere: the roofs of Vienna in a ring, "Rooftop Belvedere" in champagne gold, for a dark background
- Source: designed for this project as SVG and rendered as PNG with resvg, transparent background; fonts Cormorant Garamond, Montserrat (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: fonts SIL Open Font License 1.1
- Retrieved: 2026-11-01 (fonts)
- Changes: none after rendering; cropped to the content and scaled to 800 pixels wide

## `zur-linde-cover.jpg`

- Motif: Cover image of Gasthaus zur Linde: beer garden under trees
- Source: https://commons.wikimedia.org/wiki/File:Biergarten_im_Maria-Einsiedel-Bad_Biergarten-bjs200723-02.jpg
- Photographer: Bjs
- Licence: CC0 1.0
- Retrieved: 2026-11-01
- Changes: cropped, scaled to 2000 × 1125, the print on the parasol and the ice-cream and drinks signs blurred

## `kafana-dunav-cover.jpg`

- Motif: Cover image of Kafana Dunav: garden by the river at night
- Source: https://commons.wikimedia.org/wiki/File:Neckarmueller-biergarten-bei-nacht.jpg
- Photographer: Dktue
- Licence: CC0 1.0
- Retrieved: 2026-11-01
- Changes: cropped, scaled to 2000 × 1125, the restaurant's sign on the fence blurred

## `rooftop-belvedere-cover.jpg`

- Motif: Cover image of Rooftop Belvedere: bar high above the city at dusk
- Source: https://commons.wikimedia.org/wiki/File:Restaurant_at_dusk_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/KveL_hxuY0Q (under CC0 at the time)
- Photographer: Patryk Sobczak (patryksobczak on Unsplash)
- Licence: CC0 1.0
- Retrieved: 2026-11-01
- Changes: cropped (guests in the foreground on the right cut off), scaled to 2000 × 1125

## `gaststube-photo.jpg`

- Motif: Area "Gaststube" (Gasthaus zur Linde): old wooden parlour
- Source: https://commons.wikimedia.org/wiki/File:Freilichtmuseum_Salzburg_3.jpg
- Photographer: Edelmauswaldgeist
- Licence: CC0 1.0
- Retrieved: 2026-11-01
- Changes: cropped, scaled to 1200 × 800

## `terrasse-photo.jpg`

- Motif: Area "Terrasse" (Gasthaus zur Linde): laid table on a terrace under trees
- Source: https://commons.wikimedia.org/wiki/File:Lunch_table_on_a_balcony,_Mainz.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-01
- Changes: cropped (guests in the background cut off), scaled to 1200 × 800

## `sala-photo.jpg`

- Motif: Area "Sala" (Kafana Dunav): rustic dining room
- Source: https://commons.wikimedia.org/wiki/File:Restaurant_in_Ljubljana_2014.jpg; originally published on Pixabay, http://pixabay.com/en/restaurant-georgian-ljubljana-469212/ (under CC0 at the time)
- Photographer: tatianawillmann
- Licence: CC0 1.0
- Retrieved: 2026-11-01
- Changes: cropped, scaled to 1200 × 800

## `basta-photo.jpg`

- Motif: Area "Bašta" (Kafana Dunav): café garden under trees above the Danube, Petrovaradin
- Source: https://commons.wikimedia.org/wiki/File:The_most_beautiful_view_from_Petrovaradin.JPG
- Photographer: Singidunum
- Licence: CC0 1.0
- Retrieved: 2026-11-01
- Changes: cropped, scaled to 1200 × 800

## `rooftop-photo.jpg`

- Motif: Area "Rooftop" (Rooftop Belvedere): rooftop terrace with lounge chairs
- Source: https://commons.wikimedia.org/wiki/File:Madrid_-_Sky_Bar_360%C2%BA_02.jpg
- Photographer: Zarateman
- Licence: CC0 1.0
- Retrieved: 2026-11-01
- Changes: cropped, scaled to 1200 × 800

## `lounge-photo.jpg`

- Motif: Area "Lounge" (Rooftop Belvedere): lounge behind panorama windows
- Source: https://commons.wikimedia.org/wiki/File:BLUE_FRONT_SHIBAURA_SKY_LOUNGE_17.jpg
- Photographer: ドクター・イエロー
- Licence: CC0 1.0
- Retrieved: 2026-11-01
- Changes: cropped, scaled to 1200 × 800
