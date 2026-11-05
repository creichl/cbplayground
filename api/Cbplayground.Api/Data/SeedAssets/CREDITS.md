# Image credits

The cover images, area photos and gallery photos (`*-gallery-*.jpg`) of the demo restaurants are real photos under **CC0 1.0** (Creative Commons Public Domain Dedication,
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

- Montserrat (Julieta Ulanovsky and contributors): label "Blick auf den Stephansdom" on the Rooftop (set with Pillow), logo of Rooftop Belvedere
- Cormorant Garamond (Christian Thalmann): logo of Rooftop Belvedere
- Merriweather (Sorkin Type): logo of Gasthaus zur Linde
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
- Changes: textures brightened and partly recoloured, models scaled and placed; rendered at 1800 × 1200 pixels, denoised; the label "Blick auf den Stephansdom" and its arrows set afterwards with Pillow in Montserrat; saved as WebP

## `lounge.webp`

- Motif: Floor plan of the area "Lounge" (Rooftop Belvedere), top view of a room of 13 × 8.2 m: herringbone parquet, panorama windows, two sofas, small bar, entrance
- Source: rendered for this project with Blender 4.2 LTS (Cycles) from a scene modelled for it; uses the materials `WoodFloor034`, `Fabric030`, `Wood066`, `Marble015`; models `metal_stool_02`, `potted_plant_01`, `potted_plant_02`, `calathea_orbifolia_01` (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: materials and models CC0 1.0, font SIL Open Font License 1.1
- Retrieved: 2026-11-01 (materials, models and fonts)
- Changes: textures brightened and partly recoloured, models scaled and placed; rendered at 1800 × 1200 pixels, denoised, saved as WebP

## `zur-linde-logo.png`

- Motif: Logo of Gasthaus zur Linde: a linden leaf in a ring, "Gasthaus" and "zur Linde" in two lines in green
- Source: designed for this project as SVG and rendered as PNG with resvg, transparent background; font Merriweather (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: fonts SIL Open Font License 1.1
- Retrieved: 2026-11-01 (fonts)
- Changes: none after rendering; cropped to the content and scaled to 800 pixels wide

## `kafana-dunav-logo.png`

- Motif: Logo of Kafana Dunav: a bridge over the Danube in a blue circle, "Kafana" and "Dunav" in two lines in blue
- Source: designed for this project as SVG and rendered as PNG with resvg, transparent background; fonts Playfair Display, Source Sans 3 (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: fonts SIL Open Font License 1.1
- Retrieved: 2026-11-01 (fonts)
- Changes: none after rendering; cropped to the content and scaled to 800 pixels wide

## `rooftop-belvedere-logo.png`

- Motif: Logo of Rooftop Belvedere: the roofs of Vienna in a ring, "Rooftop" and "Belvedere" in two lines in champagne gold, for a dark background
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

## `zur-linde-gallery-schweinsbraten.jpg`

- Motif: Gallery of Gasthaus zur Linde: Schweinsbraten with dumplings and red cabbage
- Source: https://commons.wikimedia.org/wiki/File:Schweinsbraten,_Oberursel.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG; the brewery's name on the rim of the plate and the print on the paper under the glass blurred

## `zur-linde-gallery-holzfass.jpg`

- Motif: Gallery of Gasthaus zur Linde: dark beer on the top of a wooden barrel
- Source: https://commons.wikimedia.org/wiki/File:Beer_on_a_barrel_top_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/AFTYTQCt9aQ (under CC0 at the time)
- Photographer: Alice Donovan Rouse (alicekat on Unsplash)
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG; the brewery's logo etched on the glass blurred

## `zur-linde-gallery-kachelofen.jpg`

- Motif: Gallery of Gasthaus zur Linde: parlour with a green tiled stove, chairs and benches
- Source: https://commons.wikimedia.org/wiki/File:Ackerhus_Kachelofen.jpg
- Photographer: Plutowiki
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG; the plaque on the stove blurred

## `zur-linde-gallery-biergarten.jpg`

- Motif: Gallery of Gasthaus zur Linde: beer garden under old trees at dusk (Hirschgarten, Munich), the guests small in the background
- Source: https://commons.wikimedia.org/wiki/File:Wzwz_hg06_bg.JPG
- Photographer: Wzwz
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG; brightened

## `zur-linde-gallery-weisswurst-brezn.jpg`

- Motif: Gallery of Gasthaus zur Linde: Weißwurst with a pretzel and sweet mustard
- Source: https://commons.wikimedia.org/wiki/File:Wei%C3%9Fwurst,_Munich.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `zur-linde-gallery-helles.jpg`

- Motif: Gallery of Gasthaus zur Linde: glass of lager on a garden table
- Source: https://commons.wikimedia.org/wiki/File:Biera_glaso.jpg; originally published on Pixabay, https://pixabay.com/pt/ale-cerveja-vidro-%C3%A1lcool-bebida-2299366 (under CC0 at the time)
- Photographer: Milesl
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `zur-linde-gallery-kaiserschmarrn.jpg`

- Motif: Gallery of Gasthaus zur Linde: Kaiserschmarrn in the pan with apple sauce
- Source: https://commons.wikimedia.org/wiki/File:Kaiserschmarrn,_Munich.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `kafana-dunav-gallery-riblja-corba.jpg`

- Motif: Gallery of Kafana Dunav: fish soup in a pot and on the plate
- Source: https://commons.wikimedia.org/wiki/File:Fish_soup,_Porto_Moniz,_Madeira.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `kafana-dunav-gallery-rostilj.jpg`

- Motif: Gallery of Kafana Dunav: mixed grill (ćevapi, sausage, pljeskavica, pork) with fries
- Source: https://commons.wikimedia.org/wiki/File:%D0%9C%D0%B0%D0%BA%D0%B5%D0%B4%D0%BE%D0%BD%D1%81%D0%BA%D0%B0_%D0%BC%D0%B5%D1%88%D0%B0%D0%BD%D0%B0_%D1%81%D0%BA%D0%B0%D1%80%D0%B0_%D1%81%D0%BE_%D0%BF%D0%BE%D0%BC%D1%84%D1%80%D0%B8%D1%82.jpg ("Македонска мешана скара со помфрит")
- Photographer: Делфина (Delfina)
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `kafana-dunav-gallery-vino.jpg`

- Motif: Gallery of Kafana Dunav: red wine poured into two glasses at sunset
- Source: https://commons.wikimedia.org/wiki/File:Sunset_and_wine_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/3etN9PY6iNw (under CC0 at the time)
- Photographer: nic chiro (photo-nic.co.uk on Unsplash)
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped from portrait to 3:2 (the feet of the glasses cut off), scaled to 1600 × 1067, saved as JPEG; the emblem on the bottle blurred

## `kafana-dunav-gallery-dunav.jpg`

- Motif: Gallery of Kafana Dunav: sunset over the Danube (Danube Delta), no people
- Source: https://commons.wikimedia.org/wiki/File:Sunset_in_the_Danube_Delta.jpg
- Photographer: ZwecklosHupen
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `kafana-dunav-gallery-tamburasi.jpg`

- Motif: Gallery of Kafana Dunav: tamburica players with brač, only their hands and bodies in the picture
- Source: https://commons.wikimedia.org/wiki/File:Bra%C4%8D_players_in_the_tamburica_ensemble_(2019-04-20_16.52.06_by_Marko_Milivojevic_@PIXNIO_2592514).jpg; originally published on PIXNIO, https://pixnio.com/media/guitarist-orchestra-guitar-musician-folk (CC0)
- Photographer: Marko Milivojevic (milim84)
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `kafana-dunav-gallery-sto.jpg`

- Motif: Gallery of Kafana Dunav: laid table with glasses and lavender by a window
- Source: https://commons.wikimedia.org/wiki/File:Dinner_at_a_bistro_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/6gcc9Z4pgWY (under CC0 at the time)
- Photographer: Paweł Wojciechowski (pawelwojciechowski on Unsplash)
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `rooftop-belvedere-gallery-cocktails.jpg`

- Motif: Gallery of Rooftop Belvedere: two fruity cocktails on a wooden table outside, a guest's arm without face in the background
- Source: https://commons.wikimedia.org/wiki/File:Fruity_cocktails_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/VEjN2jMxf0A (under CC0 at the time)
- Photographer: Tomasz Rynkiewicz (thmsr on Unsplash)
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `rooftop-belvedere-gallery-sharing-plates.jpg`

- Motif: Gallery of Rooftop Belvedere: small plates and wine on a wooden table
- Source: https://commons.wikimedia.org/wiki/File:Vintage_wine_dinner_for_two_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/xIFbDeGcy44 (under CC0 at the time)
- Photographer: Stefan Johnson (stefanjonhson on Unsplash)
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `rooftop-belvedere-gallery-bar.jpg`

- Motif: Gallery of Rooftop Belvedere: cocktail on the bar by candlelight in the evening, a hand without face in the background
- Source: https://commons.wikimedia.org/wiki/File:Arcana_cocktail_2.jpg
- Photographer: Coldcashcow
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG; the label of the water bottle blurred

## `rooftop-belvedere-gallery-sonnenuntergang.jpg`

- Motif: Gallery of Rooftop Belvedere: the skyline of Vienna (Donau City) at sunset, reflected in the water
- Source: https://commons.wikimedia.org/wiki/File:Vienna,_Austria_(49266021741).jpg; originally published on Flickr, https://www.flickr.com/photos/pierre9x6/49266021741/ (CC0)
- Photographer: Pierre Blaché
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `rooftop-belvedere-gallery-lounge.jpg`

- Motif: Gallery of Rooftop Belvedere: lounge corner with armchairs, sofa and carpets under a glass ceiling (Hotel Astoria, Budapest), no people
- Source: https://commons.wikimedia.org/wiki/File:Budapest,_Astoria_Hotel,_79.jpg
- Photographer: Random photos 1989
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG around the seating

## `rooftop-belvedere-gallery-champagner.jpg`

- Motif: Gallery of Rooftop Belvedere: two champagne coupes in front of a black background
- Source: https://commons.wikimedia.org/wiki/File:Champagne-glasses-1940262_1920.jpg; originally published on Pixabay, https://pixabay.com/fr/photos/verres-à-champagne-champagne-verres-1940262/ (under CC0 at the time)
- Photographer: Myriam Zilles
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `rooftop-belvedere-gallery-blick.jpg`

- Motif: Gallery of Rooftop Belvedere: view over the roofs of Vienna from the hills in the early light
- Source: https://commons.wikimedia.org/wiki/File:Morning_light._-_Flickr_-_simon_berger.jpg; originally published on Flickr, https://www.flickr.com/photos/simon_berger/54428739780/ (CC0)
- Photographer: Simon Berger
- Licence: CC0 1.0
- Retrieved: 2026-11-05
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG; the panorama cut to its middle part
