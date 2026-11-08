# Image credits

The cover images, area photos, gallery photos (`*-gallery-*.jpg`) and dish photos of the menus (`*-menu-*.jpg`) of the demo restaurants are real photos under **CC0 1.0** (Creative Commons Public Domain Dedication,
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

All retrieved on 2026-11-01; the fonts of the logos of Trattoria Il Faro, Café Morgenrot and Izakaya Kaze (Playfair Display, Source Sans 3, Inter, Montserrat) on 2026-11-08.

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

- Montserrat (Julieta Ulanovsky and contributors): label "Blick auf den Stephansdom" on the Rooftop (set with Pillow), logos of Rooftop Belvedere and Izakaya Kaze
- Cormorant Garamond (Christian Thalmann): logo of Rooftop Belvedere
- Merriweather (Sorkin Type): logo of Gasthaus zur Linde
- Playfair Display (Claus Eggers Sørensen) and Source Sans 3 (Paul D. Hunt): logos of Kafana Dunav and Trattoria Il Faro
- Inter (Rasmus Andersson): logo of Café Morgenrot

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

## `zur-linde-menu-flaedlesuppe.jpg`

- Motif: Menu of Gasthaus zur Linde: clear beef broth with pancake strips and chives in a soup cup
- Source: https://commons.wikimedia.org/wiki/File:Frittatensuppe_1.JPG
- Photographer: Brücke-Osteuropa
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `zur-linde-menu-leberkaes.jpg`

- Motif: Menu of Gasthaus zur Linde: a slice of Leberkäse with a fried egg, cucumber and carrot on a flowered plate
- Source: https://commons.wikimedia.org/wiki/File:Leberk%C3%A4se,_R%C3%BCdesheim.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3 around the plate (the second plate and a glass cut off), scaled to 1200 × 900, saved as JPEG

## `zur-linde-menu-schnitzel.jpg`

- Motif: Menu of Gasthaus zur Linde: two breaded schnitzel with cranberries, lemon and herbs on a white plate
- Source: https://commons.wikimedia.org/wiki/File:Wiener_Schnitzel,_Aachen.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3 (the cutlery with its maker's mark cut off), scaled to 1200 × 900, saved as JPEG

## `zur-linde-menu-kaesespaetzle.jpg`

- Motif: Menu of Gasthaus zur Linde: Käsespätzle with fried onions in a copper pan
- Source: https://commons.wikimedia.org/wiki/File:Cheese-noodles-609776.jpg; originally published on Pixabay, https://pixabay.com/de/k%C3%A4sesp%C3%A4tzle-gericht-essen-lecker-609776/ (under CC0 at the time)
- Photographer: Hans Braxmeier
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: scaled to 1200 × 900, saved as JPEG

## `zur-linde-menu-rahmschwammerl.jpg`

- Motif: Menu of Gasthaus zur Linde: forest mushrooms in cream sauce with a bread dumpling and grated cheese
- Source: https://commons.wikimedia.org/wiki/File:Semmelkn%C3%B6del_and_forest_mushrooms,_Oestrich.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3 around the plate (the table setting cut off), scaled to 1200 × 900, saved as JPEG

## `zur-linde-menu-kalbsbraten.jpg`

- Motif: Menu of Gasthaus zur Linde: roast leg of veal in sauce with two bread dumplings
- Source: https://commons.wikimedia.org/wiki/File:Steckenroth,_leg_of_veal_with_dumplings.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3 around the plate (fork and napkin cut off), scaled to 1200 × 900, saved as JPEG

## `zur-linde-menu-apfelstrudel.jpg`

- Motif: Menu of Gasthaus zur Linde: Apfelstrudel with vanilla ice cream and whipped cream
- Source: https://commons.wikimedia.org/wiki/File:Apfelstrudel_et_glace_vanille.jpg
- Photographer: Arnaud 25
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: scaled to 1200 × 900, saved as JPEG

## `kafana-dunav-menu-cevapi.jpg`

- Motif: Menu of Kafana Dunav: ćevapi with French fries, chopped onion, lettuce and a cherry tomato on a white plate
- Source: https://commons.wikimedia.org/wiki/File:Ćevapčići_in_Montenegro.jpg
- Photographer: Spacekid
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `kafana-dunav-menu-pljeskavica.jpg`

- Motif: Menu of Kafana Dunav: grilled pljeskavica with grilled lepinja flatbread, French fries, coleslaw and a tomato dip
- Source: https://commons.wikimedia.org/wiki/File:Budapest,_Grill_Mánia,_pljeskavica.jpg
- Photographer: Christo
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `kafana-dunav-menu-sopska.jpg`

- Motif: Menu of Kafana Dunav: Šopska salad of tomato and cucumber under grated white cheese, with an olive and a green chilli pepper
- Source: https://commons.wikimedia.org/wiki/File:Šopska_salata.jpg
- Photographer: August Dominus
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `kafana-dunav-menu-sarma.jpg`

- Motif: Menu of Kafana Dunav: two sarma cabbage rolls sprinkled with chilli flakes in an earthenware dish
- Source: https://commons.wikimedia.org/wiki/File:Sarma_in_Skopje,_2026.jpg
- Photographer: Bdx
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `kafana-dunav-menu-punjene-paprike.jpg`

- Motif: Menu of Kafana Dunav: green peppers stuffed with minced meat and rice
- Source: https://commons.wikimedia.org/wiki/File:Stuffed_Peppers_Florentine.jpg
- Photographer: Roundhere44
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `kafana-dunav-menu-ajvar.jpg`

- Motif: Menu of Kafana Dunav: close-up of ajvar spread on a slice of toasted bread
- Source: https://commons.wikimedia.org/wiki/File:Ajvar_toast.jpg
- Photographer: Popo le Chien
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `kafana-dunav-menu-meze.jpg`

- Motif: Menu of Kafana Dunav: cold meze board with prosciutto, cheese, olives, ajvar, a creamy kajmak-style spread and layered pastry on lettuce
- Source: https://commons.wikimedia.org/wiki/File:Македонско_предјадење_со_сувомеснато_и_ѓомлезе.jpg
- Photographer: Делфина
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `kafana-dunav-menu-prebranac.jpg`

- Motif: Menu of Kafana Dunav: bowl of bean stew (pasulj) with smoked sausage and carrots
- Source: https://commons.wikimedia.org/wiki/File:Bjelajski_Pasulj_(varivo)_1.jpg
- Photographer: Zavičajac
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `kafana-dunav-menu-karadjordjeva.jpg`

- Motif: Menu of Kafana Dunav: breaded rolled Karađorđeva šnicla with French fries, rocket, lemon, kajmak and a white dip, Šopska salad in the background
- Source: https://commons.wikimedia.org/wiki/File:Karađorđeva_šnicla,_Belgrade,_November_2024.jpg
- Photographer: Bdx
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `kafana-dunav-menu-riba.jpg`

- Motif: Menu of Kafana Dunav: whole grilled trout with lemon, steamed vegetables, potatoes and rice on a white plate
- Source: https://commons.wikimedia.org/wiki/File:Grilled_trout,_Restaurant_Trofta,_Istog,_2025.jpg
- Photographer: Bdx
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `rooftop-belvedere-menu-burrata.jpg`

- Motif: Menu of Rooftop Belvedere: burrata on sliced heirloom tomatoes with pea shoots and edible flowers on a stoneware plate
- Source: https://commons.wikimedia.org/wiki/File:Tomato_salad_with_burrata,_Limburg.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `rooftop-belvedere-menu-tatar.jpg`

- Motif: Menu of Rooftop Belvedere: beef tartare with vegetable crisps, frisée and toasted sourdough on a blue-grey plate
- Source: https://commons.wikimedia.org/wiki/File:Steak_tartare,_vegetable_crisps_and_toasted_bread_-_Petit_Pois_Restaurant_2024-07-11.jpg
- Photographer: Andy Li
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `rooftop-belvedere-menu-austern.jpg`

- Motif: Menu of Rooftop Belvedere: freshly opened oysters on crushed ice
- Source: https://commons.wikimedia.org/wiki/File:Le_Harenguier_(Beynost)_des_huîtres_en_janvier_2020.jpg
- Photographer: Benoît Prieur
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `rooftop-belvedere-menu-tataki.jpg`

- Motif: Menu of Rooftop Belvedere: seared tuna tataki with sesame, seaweed, micro herbs, mango purée and herb oil on a white plate
- Source: https://commons.wikimedia.org/wiki/File:Restaurant_Almyvita_(Almyrida)_-_tataki_de_thon.jpg
- Photographer: Benoît Prieur
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `rooftop-belvedere-menu-hummus.jpg`

- Motif: Menu of Rooftop Belvedere: hummus with paprika and parsley in a white bowl, surrounded by pita bread wedges
- Source: https://commons.wikimedia.org/wiki/File:Houmous.jpg
- Photographer: Popo le Chien
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `rooftop-belvedere-menu-risotto.jpg`

- Motif: Menu of Rooftop Belvedere: creamy risotto with seared lobster in a white bowl
- Source: https://commons.wikimedia.org/wiki/File:Risotto_with_lobster,_Sachsenhausen.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `rooftop-belvedere-menu-lachs.jpg`

- Motif: Menu of Rooftop Belvedere: pan-seared glazed salmon fillet with Brussels sprouts and roasted root vegetables on a white plate
- Source: https://commons.wikimedia.org/wiki/File:Salmon,_pan-seared_and_glazed,_with_Brussels_sprouts_and_root_vegetables_-_Massachusetts.jpg
- Photographer: Daderot
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `rooftop-belvedere-menu-steak.jpg`

- Motif: Menu of Rooftop Belvedere: seared beef tenderloin (filet mignon) with herbs and jus on a white plate
- Source: https://commons.wikimedia.org/wiki/File:Wit_and_Wisdom_-_November_2025_-_Sarah_Stierch_04.jpg
- Photographer: Missvain
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `rooftop-belvedere-menu-schnitzel.jpg`

- Motif: Menu of Rooftop Belvedere: Wiener Schnitzel with a lemon in a net, mixed salad and parsley potatoes
- Source: https://commons.wikimedia.org/wiki/File:Wiener_Schnitzel_in_Wien.JPG
- Photographer: Brücke-Osteuropa
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3 (restaurant name printed on the plate rim cut off), scaled to 1200 × 900, saved as JPEG

## `rooftop-belvedere-menu-creme-brulee.jpg`

- Motif: Menu of Rooftop Belvedere: crème brûlée with caramelised crust, powdered sugar and mint in a white ramekin
- Source: https://commons.wikimedia.org/wiki/File:Alex_Munsell_2015_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/wiTWDYLURr8 (under CC0 at the time)
- Photographer: Alex Munsell (alexmunsell on Unsplash)
- Licence: CC0 1.0
- Retrieved: 2026-11-07
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `zur-linde-gallery-maibaum.jpg`

- Motif: Gallery of Gasthaus zur Linde: blue-and-white Bavarian maypole with carved guild figures against a blue sky with clouds (Gelting, Upper Bavaria)
- Source: https://commons.wikimedia.org/wiki/File:Maibaum_Gelting.jpg
- Photographer: Edelmauswaldgeist
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `zur-linde-gallery-frauenkirche.jpg`

- Motif: Gallery of Gasthaus zur Linde: the twin towers of the Frauenkirche in Munich with their green onion domes, seen from Marienplatz on a bright overcast day
- Source: https://commons.wikimedia.org/wiki/File:2019-11-16,_T%C3%BCrme,_M%C3%BCnchner_Frauenkirche,_IMG_7470_edit_Christoph_Braun.JPG
- Photographer: Christoph Braun
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `zur-linde-gallery-laugensemmeln.jpg`

- Motif: Gallery of Gasthaus zur Linde: freshly baked pretzel rolls (Laugensemmeln) with coarse salt on a dark baking tray
- Source: https://commons.wikimedia.org/wiki/File:%D0%91%D0%B0%D0%B2%D0%B0%D1%80%D1%81%D0%BA%D0%B8_%D0%BB%D0%B5%D0%BF%D1%87%D0%B8%D1%9A%D0%B0.jpg ("Баварски лепчиња")
- Photographer: Gordana Adzieva
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `kafana-dunav-gallery-novi-sad.jpg`

- Motif: Gallery of Kafana Dunav: view from Petrovaradin Fortress over the Danube, the Varadin Bridge and Novi Sad on a sunny spring day
- Source: https://commons.wikimedia.org/wiki/File:Varadinski_most_u_Novom_Sadu_2022.jpg
- Photographer: Imeao
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `kafana-dunav-gallery-kafa.jpg`

- Motif: Gallery of Kafana Dunav: copper džezva with freshly brewed coffee and a white cup on a blue plate, seen from above
- Source: https://commons.wikimedia.org/wiki/File:Caf%C3%A9_grec_%C3%A0_Almyrida_(1).jpg
- Photographer: Benoît Prieur
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, label of a sugar sachet blurred, saved as JPEG

## `kafana-dunav-gallery-baklava.jpg`

- Motif: Gallery of Kafana Dunav: rows of baklava rolls with sour cherries, glazed with syrup, in the tray
- Source: https://commons.wikimedia.org/wiki/File:%D0%91%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B0_%D1%81%D0%BE_%D0%B2%D0%B8%D1%88%D0%BD%D0%B0.jpg ("Баклава со вишна")
- Photographer: Lili Arsova
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `kafana-dunav-gallery-gibanica.jpg`

- Motif: Gallery of Kafana Dunav: a whole golden-baked gibanica (cheese pie of filo pastry) in a round baking dish, seen from above
- Source: https://commons.wikimedia.org/wiki/File:Gibanica_februar_26.jpg
- Photographer: Biljana Milenković SD
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `rooftop-belvedere-gallery-stephansdom.jpg`

- Motif: Gallery of Rooftop Belvedere: the patterned tiled roof and the south tower of St. Stephen's Cathedral in Vienna, lit at night against a black sky
- Source: https://commons.wikimedia.org/wiki/File:Stephansdom_Wien_at_night_2022-08-08_01.jpg
- Photographer: Leonhard Lenz
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `rooftop-belvedere-gallery-belvedere.jpg`

- Motif: Gallery of Rooftop Belvedere: the Upper Belvedere in Vienna lit at night with festive star lights, mirrored in the pond, no people
- Source: https://commons.wikimedia.org/wiki/File:Belvedere_Palace_1.jpg
- Photographer: Dimitry Anikin
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `rooftop-belvedere-gallery-dessert.jpg`

- Motif: Gallery of Rooftop Belvedere: plated dessert of fresh berries, chocolate quenelle, crumble, a caramel flower and lemon basil on a dark stoneware plate
- Source: https://commons.wikimedia.org/wiki/File:Dessert_for_Chef%27s_table,_Mainz.jpg
- Photographer: Gerda Arendt
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `rooftop-belvedere-gallery-dj.jpg`

- Motif: Gallery of Rooftop Belvedere: close-up of a DJ deck with jog wheel and glowing buttons in the dark, no people
- Source: https://commons.wikimedia.org/wiki/File:DJ_turntable_in_close-up_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/JiSNvVs3keU (under CC0 at the time)
- Photographer: Dan Stark dan_stark
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `cafe-morgenrot-cover.jpg`

- Motif: Cover image of Café Morgenrot: brunch table from above: porridge and yoghurt bowls with berries, waffles with honeycomb, a cup of tea, milk jugs and honey on white marble
- Source: https://commons.wikimedia.org/wiki/File:Breakfast_on_the_Veranda_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/HlNcigvUi4Q (under CC0 at the time)
- Photographer: Brooke Lark brookelark
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped, scaled to 2000 × 1125, saved as JPEG

## `cafe-morgenrot-cafe-photo.jpg`

- Motif: Area "Café" of Café Morgenrot: bright café room with tall arched windows onto green trees, a leather bench, wooden tables with small succulents and copper pendant lamps
- Source: https://commons.wikimedia.org/wiki/File:Arched_café_windows_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/ACtEE_FcaRU (under CC0 at the time)
- Photographer: The Anchor anchorcoffee
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped, scaled to 1200 × 800, window decals (logo and lettering) blurred, saved as JPEG

## `cafe-morgenrot-gastgarten-photo.jpg`

- Motif: Area "Gastgarten" of Café Morgenrot: garden café courtyard with wooden folding chairs and round tables under a large tree
- Source: https://commons.wikimedia.org/wiki/File:Schillerhaus_Rudolstadt,_Garten_04.jpg
- Photographer: Catatine
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped, scaled to 1200 × 800, saved as JPEG

## `cafe-morgenrot-gallery-cappuccino.jpg`

- Motif: Gallery of Café Morgenrot: cappuccino with latte art in a white cup on a saucer
- Source: https://commons.wikimedia.org/wiki/File:Latte_art_on_cappuccino_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/tZKwLRO904E (under CC0 at the time)
- Photographer: Drew Coffman drewcoffman
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `cafe-morgenrot-gallery-pancakes.jpg`

- Motif: Gallery of Café Morgenrot: stack of pancakes with strawberries, blueberries and syrup on a white plate
- Source: https://commons.wikimedia.org/wiki/File:Pancakes_with_Berries_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/odouHPr0Lqw (under CC0 at the time)
- Photographer: Herson Rodriguez hero
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `cafe-morgenrot-gallery-brunch.jpg`

- Motif: Gallery of Café Morgenrot: friends sharing brunch at a round table, seen from above (hands only)
- Source: https://commons.wikimedia.org/wiki/File:Brunching_with_Friends_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/y3aP9oo9Pjc (under CC0 at the time)
- Photographer: Ali Inay inayali
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `cafe-morgenrot-gallery-avocado-toast.jpg`

- Motif: Gallery of Café Morgenrot: avocado toasts with avocado roses, rosemary and sesame on a blue stone surface
- Source: https://commons.wikimedia.org/wiki/File:Avocado_Rose_Toast_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/k4116JZ07S0 (under CC0 at the time)
- Photographer: Brenda Godinez cravethebenefits
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `cafe-morgenrot-gallery-bakery.jpg`

- Motif: Gallery of Café Morgenrot: rustic breads in baskets behind a bakery counter window with handwritten price cards
- Source: https://commons.wikimedia.org/wiki/File:Fresh_Bread_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/Mvz8Xfy3TPU (under CC0 at the time)
- Photographer: Roman Kraft romankraft
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `cafe-morgenrot-gallery-uhrturm.jpg`

- Motif: Gallery of Café Morgenrot: the Uhrturm (clock tower) on the Schlossberg in Graz in morning sun, with the rooftops of Graz behind
- Source: https://commons.wikimedia.org/wiki/File:Uhrturm_in_Graz.jpg
- Photographer: DJ3tausend
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `cafe-morgenrot-gallery-garden-morning.jpg`

- Motif: Gallery of Café Morgenrot: long wooden table and stools in a garden in dappled morning light
- Source: https://commons.wikimedia.org/wiki/File:Restaurant_Patio_Furniture_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/yEuEHQdLLEc (under CC0 at the time)
- Photographer: rawpixel.com rawpixel
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `cafe-morgenrot-gallery-breakfast-table.jpg`

- Motif: Gallery of Café Morgenrot: breakfast table with orange juice, a plate of sliced fruit and cherries, small toasts and a teapot
- Source: https://commons.wikimedia.org/wiki/File:Brooke_Lark_2016_(Unsplash).jpg; originally published on Unsplash, http://unsplash.com/photos/IDTEXXXfS44 (under CC0 at the time)
- Photographer: Brooke Lark brookelark
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `cafe-morgenrot-gallery-apricot-jam.jpg`

- Motif: Gallery of Café Morgenrot: jars of apricot jam with fresh apricots, redcurrants and a wooden spoon
- Source: https://commons.wikimedia.org/wiki/File:Apricot_jam.jpg; originally published on Pixabay, https://pixabay.com/photo-2444752/ (under CC0 at the time)
- Photographer: Rita
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 3:2, scaled to 1600 × 1067, saved as JPEG

## `cafe-morgenrot-menu-eggs-benedict.jpg`

- Motif: Menu of Café Morgenrot: eggs Benedict with hollandaise, side salad and cherry tomatoes
- Source: https://commons.wikimedia.org/wiki/File:Eggs_Benedict_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/dKxGVeb3F2w (under CC0 at the time)
- Photographer: Constance Chen theskyandthesea
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `cafe-morgenrot-menu-shakshuka.jpg`

- Motif: Menu of Café Morgenrot: shakshuka: eggs baked in tomato sauce in a pan, with bread
- Source: https://commons.wikimedia.org/wiki/File:Shakshuka_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/2IHVVbT08f8 (under CC0 at the time)
- Photographer: Jarosław Ceborski jarson
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `cafe-morgenrot-menu-waffles.jpg`

- Motif: Menu of Café Morgenrot: waffle with yoghurt, blueberries, strawberries and granola
- Source: https://commons.wikimedia.org/wiki/File:Fruit_waffles_and_coffee_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/Wns3U-oVoLA (under CC0 at the time)
- Photographer: Joseph Gonzalez miracletwentyone
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 4:3, scaled to 1200 × 900, side plate cut off, saved as JPEG

## `cafe-morgenrot-menu-french-toast.jpg`

- Motif: Menu of Café Morgenrot: French toast with cream, fresh berries and edible flowers
- Source: https://commons.wikimedia.org/wiki/File:Breakfast_at_Dawn_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/aGjP08-HbYY (under CC0 at the time)
- Photographer: Brooke Lark brookelark
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `cafe-morgenrot-menu-sandwich.jpg`

- Motif: Menu of Café Morgenrot: toasted sandwich with ham, cheese, egg, tomato and lettuce
- Source: https://commons.wikimedia.org/wiki/File:Breakfast_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/ya5oLwJff4g (under CC0 at the time)
- Photographer: Sofiya Levchenko sofelini
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `cafe-morgenrot-menu-croissant.jpg`

- Motif: Menu of Café Morgenrot: butter croissant on a plate with a knife
- Source: https://commons.wikimedia.org/wiki/File:Croissant_-_GAIL's_2024-08-18.jpg
- Photographer: Andy Li
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `cafe-morgenrot-menu-chia-bowl.jpg`

- Motif: Menu of Café Morgenrot: chia and yoghurt bowl with kiwi, blackberries, banana and strawberries, with orange juice and bread
- Source: https://commons.wikimedia.org/wiki/File:Healthy_Trendy_Brunch_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/8manzosDSGM (under CC0 at the time)
- Photographer: Jannis Brandt _jannis
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `cafe-morgenrot-menu-chocolate-cake.jpg`

- Motif: Menu of Café Morgenrot: slice of chocolate layer cake on a white plate
- Source: https://commons.wikimedia.org/wiki/File:Chocolate_Cake_(Unsplash).jpg; originally published on Unsplash, https://unsplash.com/photos/1Hh57OhkdCc (under CC0 at the time)
- Photographer: Toa Heftiba heftiba
- Licence: CC0 1.0
- Retrieved: 2026-11-08
- Changes: cropped to 4:3, scaled to 1200 × 900, saved as JPEG

## `il-faro-logo.png`

- Motif: Logo of Trattoria Il Faro: a lighthouse with its light over the waves in a terracotta circle, "Trattoria" and "Il Faro" in two lines in terracotta
- Source: designed for this project as SVG and rendered as PNG with resvg, transparent background; fonts Source Sans 3, Playfair Display (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: fonts SIL Open Font License 1.1
- Retrieved: 2026-11-08 (fonts)
- Changes: none after rendering; cropped to the content and scaled to 800 pixels wide

## `cafe-morgenrot-logo.png`

- Motif: Logo of Café Morgenrot: the morning sun rising out of a coffee cup in an apricot circle, "Café" and "Morgenrot" in two lines in apricot and a darker orange
- Source: designed for this project as SVG and rendered as PNG with resvg, transparent background; font Inter (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: fonts SIL Open Font License 1.1
- Retrieved: 2026-11-08 (fonts)
- Changes: none after rendering; cropped to the content and scaled to 800 pixels wide

## `izakaya-kaze-logo.png`

- Motif: Logo of Izakaya Kaze: three lines of wind in a deep red circle, "Izakaya" in red and "Kaze" in warm white in two lines, for a dark background
- Source: designed for this project as SVG and rendered as PNG with resvg, transparent background; font Montserrat (see above)
- Author: made for this project (cbplayground)
- Licence: made for this project, without rights of others: fonts SIL Open Font License 1.1
- Retrieved: 2026-11-08 (fonts)
- Changes: none after rendering; cropped to the content and scaled to 800 pixels wide
