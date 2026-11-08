using Microsoft.EntityFrameworkCore;
using static Cbplayground.Api.Data.Allergen;

namespace Cbplayground.Api.Data;

/// <summary>
/// The menus of the demo restaurants by slug, in the restaurant's language, with prices in minor units (cents or para).
/// A dish's <see cref="DemoItem.Photo"/> is the file <c>&lt;slug&gt;-menu-&lt;photo&gt;.jpg</c> in the seed assets.
/// </summary>
public static class DemoMenus
{
    private record DemoItem(string Name, string? Description, int? Price, Allergen[] Allergens, string? Photo = null,
        bool Vegetarian = false, bool Vegan = false, bool GlutenFree = false, bool Spicy = false, bool Recommended = false);

    private record DemoSection(string Name, string? Description, DemoItem[] Items);

    private static readonly Dictionary<string, DemoSection[]> Menus = new()
    {
        ["zur-linde"] =
        [
            new("Brotzeit & Vorspeisen", "Zum Bier oder vorneweg",
            [
                new("Obatzda mit Brezn und Radi", "Angemachter Camembert mit Butter, Zwiebeln und Paprika", 890, [Gluten, Milk], Vegetarian: true),
                new("Bayerischer Wurstsalat", "Regensburger in Essig und Öl mit Zwiebeln und Schnittlauch, dazu Bauernbrot", 1090, [Gluten, Celery, Mustard]),
                new("Leberkäs mit Spiegelei", "Hausgemachter Leberkäs mit Spiegelei und Gurkensalat", 1190, [Eggs, Celery, Mustard], "leberkaes"),
                new("Gemischter Salat", "Blattsalate der Saison mit Hausdressing und gerösteten Kernen", 690, [Mustard], Vegetarian: true, Vegan: true, GlutenFree: true),
            ]),
            new("Suppen", null,
            [
                new("Leberknödelsuppe", "Kräftige Rinderbrühe mit hausgemachtem Leberknödel und Schnittlauch", 590, [Gluten, Eggs, Milk, Celery]),
                new("Flädlesuppe", "Rinderbrühe mit Pfannkuchenstreifen", 550, [Gluten, Eggs, Milk, Celery], "flaedlesuppe"),
                new("Kartoffelsuppe", "Mit Majoran, Speck und Croutons", 620, [Gluten, Milk, Celery]),
            ]),
            new("Hauptgerichte", "Aus der Küche von 11:30 bis 14:00 und von 17:30 bis 21:30 Uhr",
            [
                new("Schweinsbraten", "Vom Landschwein in Dunkelbiersoße, mit Kartoffelknödel und Blaukraut", 1690, [Gluten, Celery], Recommended: true),
                new("Schweinshaxe", "Knusprig gebraten, mit Kartoffelknödel und Krautsalat", 1990, [Gluten, Celery, Mustard]),
                new("Wiener Schnitzel vom Kalb", "Mit Preiselbeeren und Zitrone, dazu Petersilienkartoffeln", 2490, [Gluten, Eggs, Milk], "schnitzel"),
                new("Käsespätzle", "Mit Bergkäse und Röstzwiebeln, dazu ein kleiner Salat", 1450, [Gluten, Eggs, Milk], "kaesespaetzle", Vegetarian: true, Recommended: true),
                new("Rahmschwammerl mit Semmelknödel", "Pilze der Saison in Rahmsoße", 1550, [Gluten, Eggs, Milk, Celery], "rahmschwammerl", Vegetarian: true),
                new("Kalbsbraten mit Semmelknödel", "Vom Kalbsschlegel, in Rahmsoße mit zwei Semmelknödeln", 1890, [Gluten, Eggs, Milk, Celery], "kalbsbraten", Recommended: true),
            ]),
            new("Nachspeisen", null,
            [
                new("Apfelstrudel", "Warm, mit Vanilleeis und Sahne", 690, [Gluten, Eggs, Milk], "apfelstrudel", Vegetarian: true, Recommended: true),
                new("Kaiserschmarrn", "Mit Zwetschgenröster, für zwei zum Teilen", 1290, [Gluten, Eggs, Milk], Vegetarian: true),
                new("Dampfnudel", "Mit Vanillesoße", 750, [Gluten, Eggs, Milk], Vegetarian: true),
            ]),
            new("Getränke", "Bier vom Holzfass, Säfte aus der Region",
            [
                new("Helles vom Holzfass 0,5 l", null, 490, [Gluten]),
                new("Dunkles 0,5 l", null, 510, [Gluten]),
                new("Radler 0,5 l", "Helles mit Zitronenlimonade", 470, [Gluten]),
                new("Apfelschorle 0,5 l", "Apfelsaft vom Bauern mit Mineralwasser", 420, [], Vegan: true, GlutenFree: true),
                new("Johannisbeerschorle 0,5 l", null, 420, [], Vegan: true, GlutenFree: true),
                new("Obstler 2 cl", "Vom Brenner aus dem Chiemgau", 450, [], Vegan: true, GlutenFree: true),
            ]),
        ],
        ["kafana-dunav"] =
        [
            new("Predjela", "Za početak i uz rakiju",
            [
                new("Ajvar na prepečenom hlebu", "Domaći ajvar od pečenih paprika", 45000, [Gluten], "ajvar", Vegetarian: true, Vegan: true),
                new("Kajmak i domaći sir", "Mladi kajmak i sitan sir, uz proju", 69000, [Milk, Eggs], Vegetarian: true),
                new("Meze za dvoje", "Pršuta, sir, kajmak, ajvar, masline i domaća pita", 149000, [Gluten, Eggs, Milk], "meze"),
                new("Šopska salata", "Paradajz, krastavac, paprika, luk i rendani beli sir", 52000, [Milk], "sopska", Vegetarian: true, GlutenFree: true),
                new("Proja", "Kukuruzni hleb sa sirom", 35000, [Eggs, Milk], Vegetarian: true),
            ]),
            new("Čorbe i kuvana jela", null,
            [
                new("Riblja čorba iz kotlića", "Šaran, som i smuđ, ljuto po želji", 79000, [Fish, Celery], GlutenFree: true, Spicy: true, Recommended: true),
                new("Teleća čorba", "Sa povrćem i jajetom", 59000, [Gluten, Eggs, Celery]),
                new("Pasulj sa kobasicom", "Kuvani pasulj sa šargarepom i dimljenom kobasicom", 69000, [Celery, Mustard], "prebranac", GlutenFree: true),
                new("Sarma", "Kiseli kupus punjen mesom i pirinčem, sa pire krompirom", 119000, [Milk], "sarma", Recommended: true),
                new("Punjene paprike", "Sa mesom i pirinčem u paradajz sosu", 109000, [Gluten, Celery], "punjene-paprike"),
            ]),
            new("Sa roštilja i iz Dunava", "Sa žara na drvenom uglju, uz lepinju i luk",
            [
                new("Ćevapi (10 kom)", "Sa crnim lukom i pomfritom, uz lepinju i kajmak", 115000, [Gluten, Milk], "cevapi", Recommended: true),
                new("Pljeskavica", "U lepinji sa roštilja, sa pomfritom i salatom od kupusa", 129000, [Gluten, Eggs], "pljeskavica"),
                new("Karađorđeva šnicla", "Teleća, punjena kajmakom, sa pomfritom i tartar sosom", 159000, [Gluten, Eggs, Milk, Mustard], "karadjordjeva", Recommended: true),
                new("Mešano meso za dvoje", "Ćevapi, pljeskavica, vešalica, kobasica i piletina", 299000, [Gluten, Milk, Mustard]),
                new("Vešalica", "Svinjski file sa roštilja, sa ljutom papričicom", 125000, [], GlutenFree: true, Spicy: true),
                new("Pastrmka sa roštilja", "Cela pastrmka sa limunom, grilovanim povrćem i pirinčem", 169000, [Fish], "riba", GlutenFree: true),
                new("Som paprikaš", "Ljuti riblji paprikaš sa domaćim rezancima", 179000, [Gluten, Eggs, Fish], Spicy: true),
            ]),
            new("Dezerti", null,
            [
                new("Palačinke sa orasima", "Dve palačinke sa mlevenim orasima i medom", 49000, [Gluten, Eggs, Milk, Nuts], Vegetarian: true),
                new("Baklava", "Sa orasima i šerbetom", 45000, [Gluten, Milk, Nuts], Vegetarian: true),
                new("Krempita", "Domaća, sa vanila kremom", 42000, [Gluten, Eggs, Milk], Vegetarian: true),
            ]),
            new("Pića", null,
            [
                new("Šljivovica 0,05 l", "Domaća, odležala u hrastovom buretu", 35000, [], Vegan: true, GlutenFree: true),
                new("Dunjevača 0,05 l", null, 39000, [], Vegan: true, GlutenFree: true),
                new("Domaća kafa", "Kuvana, sa ratlukom", 22000, [], Vegan: true, GlutenFree: true),
                new("Frankovka, čaša 0,2 l", "Crno vino sa Fruške gore", 45000, [Sulphites], Vegan: true, GlutenFree: true),
                new("Ceđena limunada 0,3 l", null, 29000, [], Vegan: true, GlutenFree: true),
            ]),
        ],
        ["rooftop-belvedere"] =
        [
            new("Zum Teilen", "Kleine Teller für den Tisch – wir empfehlen zwei bis drei pro Person",
            [
                new("Burrata", "Auf alten Tomatensorten, mit Erbsensprossen und essbaren Blüten", 1650, [Milk], "burrata", Vegetarian: true, GlutenFree: true, Recommended: true),
                new("Rindertatar", "Vom Almochsen, mit Gemüsechips, Frisée und geröstetem Sauerteigbrot", 1950, [Gluten, Eggs, Mustard], "tatar"),
                new("Thunfisch-Tataki", "Mit Sesam, Algen, Mangopüree und Kräuteröl", 1890, [Gluten, Fish, Soy, Sesame], "tataki"),
                new("Austern, 3 Stück", "Fines de Claire mit Schalotten-Vinaigrette und Zitrone", 1800, [Sulphites, Molluscs], "austern", GlutenFree: true),
                new("Hummus", "Mit Paprika, Petersilie und warmem Fladenbrot", 1150, [Gluten, Sesame], "hummus", Vegetarian: true, Vegan: true),
                new("Trüffel-Pommes", "Mit Parmesan und Trüffelmayonnaise", 890, [Eggs, Milk], Vegetarian: true),
            ]),
            new("Hauptgerichte", null,
            [
                new("Hummerrisotto", "Carnaroli-Reis mit Hummer und Krustentierfond", 3200, [Crustaceans, Milk, Celery, Sulphites], "risotto", GlutenFree: true),
                new("Glasiertes Lachsfilet", "Mit Chili-Glasur, Rosenkohl und gerösteten Erdäpfeln", 2890, [Fish, Soy], "lachs", Spicy: true, Recommended: true),
                new("Rinderfilet, 200 g", "Vom österreichischen Weiderind, mit Kräutern und Rotweinjus", 4200, [Celery, Sulphites], "steak", GlutenFree: true),
                new("Wiener Schnitzel", "Vom Kalb, mit Petersilerdäpfeln und Preiselbeeren", 2800, [Gluten, Eggs, Milk], "schnitzel", Recommended: true),
                new("Gelbes Curry", "Mit Gemüse, Thai-Basilikum und Jasminreis", 2200, [Peanuts, Soy], Vegetarian: true, Vegan: true, Spicy: true),
            ]),
            new("Desserts", null,
            [
                new("Sachertorte", "Nach Wiener Art, mit Schlagobers", 950, [Gluten, Eggs, Milk], Vegetarian: true, Recommended: true),
                new("Crème brûlée", "Mit Tahiti-Vanille", 1050, [Eggs, Milk], "creme-brulee", Vegetarian: true, GlutenFree: true),
                new("Tiramisu", "Im Glas, mit Espresso und Amaretto", 1050, [Gluten, Eggs, Milk], Vegetarian: true),
                new("Sorbet-Trio", "Mango, Himbeere und Zitrone", 850, [], Vegetarian: true, Vegan: true, GlutenFree: true),
            ]),
            new("Signature-Cocktails", "Von unserer Bar, ab 17 Uhr",
            [
                new("Rooftop Spritz", "Bitter-Orangen-Aperitif, Prosecco, Soda und Orange", 1250, [Sulphites], Vegan: true, GlutenFree: true),
                new("Negroni", "Gin, roter Wermut und Bitter, mit Orangenzeste", 1450, [Sulphites], Vegan: true),
                new("Espresso Martini", "Wodka, Espresso und Kaffeelikör", 1450, []),
                new("Holunder-Gin-Fizz", "Gin, Holunderblüte, Zitrone und Soda", 1350, [], Vegan: true),
                new("Garden Cooler", "Alkoholfrei: Gurke, Basilikum, Limette und Tonic", 950, [], Vegan: true, GlutenFree: true),
            ]),
            new("Champagner & Wein", null,
            [
                new("Champagner Brut, 0,1 l", "Montagne de Reims", 1900, [Sulphites], Vegan: true, GlutenFree: true),
                new("Grüner Veltliner, 1/8", "Wachau, Federspiel", 890, [Sulphites], Vegan: true, GlutenFree: true),
                new("Blaufränkisch, 1/8", "Mittelburgenland", 950, [Sulphites], Vegan: true, GlutenFree: true),
            ]),
        ],
        ["il-faro"] =
        [
            new("Antipasti", "Zum Teilen oder für sich allein",
            [
                new("Bruschetta", "Geröstetes Weißbrot mit Kirschtomaten und Rucola", 890, [Gluten], "bruschetta", Vegetarian: true, Vegan: true),
                new("Carpaccio vom Rind", "Hauchdünn, mit Rucola, Parmesan und Zitrone", 1450, [Milk], "carpaccio", GlutenFree: true),
                new("Caprese", "Tomaten und Büffelmozzarella mit Basilikum und Balsamico", 1190, [Milk, Sulphites], "caprese", Vegetarian: true, GlutenFree: true),
                new("Antipasto misto für zwei", "Prosciutto, Salami, gegrilltes Gemüse und Bruschetta", 2190, [Gluten, Milk, Sulphites]),
                new("Minestrone", "Gemüsesuppe nach Art der Nonna", 790, [Celery], Vegetarian: true, Vegan: true, GlutenFree: true),
            ]),
            new("Pasta & Risotto", "Pasta aus eigener Herstellung, auf Wunsch glutenfrei",
            [
                new("Pici alle vongole", "Handgerollte Pici mit Venusmuscheln, Knoblauch, Weißwein und Petersilie", 1890, [Gluten, Molluscs, Sulphites], "vongole", Recommended: true),
                new("Risotto mit Garnelen", "Mit gegrillten Riesengarnelen, gerösteter Paprika und Kresse", 2150, [Crustaceans, Milk, Celery], "risotto", GlutenFree: true),
                new("Lasagne al ragù", "Mit Rinderragù, Tomatensauce und Ricotta, aus dem Ofen", 1590, [Gluten, Eggs, Milk, Celery], "lasagne", Recommended: true),
                new("Tagliatelle mit Steinpilzen", "In Butter und Salbei geschwenkt", 1690, [Gluten, Eggs, Milk], Vegetarian: true),
                new("Spaghetti alla carbonara", "Mit Guanciale, Eigelb und Pecorino", 1490, [Gluten, Eggs, Milk]),
                new("Orecchiette con cime di rapa", "Apulische Orecchiette mit Stängelkohl, Knoblauch und Chili", 1450, [Gluten], Vegetarian: true, Vegan: true, Spicy: true),
            ]),
            new("Pizza", "Aus dem Holzofen",
            [
                new("Pizza Margherita", "Tomaten, Fior di Latte und Basilikum", 1090, [Gluten, Milk], Vegetarian: true),
                new("Pizza Diavola", "Mit scharfer Salami aus Kalabrien", 1350, [Gluten, Milk], Spicy: true),
                new("Pizza Ortolana", "Mit Gemüse vom Grill, ohne Käse", 1250, [Gluten], Vegetarian: true, Vegan: true),
            ]),
            new("Secondi", null,
            [
                new("Polpo alla griglia", "Gegrillter Oktopus mit Kartoffeln aus der Pfanne, Rucola und Zitrone", 2490, [Molluscs], "octopus", GlutenFree: true, Recommended: true),
                new("Saltimbocca alla romana", "Kalbsschnitzel mit Salbei und Parmaschinken in Weißweinsauce", 2390, [Milk, Sulphites]),
                new("Fisch des Tages", "Frisch vom Großmarkt, gegrillt, mit Gemüse der Saison", 2690, [Fish], GlutenFree: true),
            ]),
            new("Dolci", null,
            [
                new("Tiramisu", "Nach dem Rezept der Nonna, mit Mascarpone und Kakao", 790, [Gluten, Eggs, Milk], "tiramisu", Vegetarian: true, Recommended: true),
                new("Panna cotta", "Mit Beerensauce", 690, [Milk], Vegetarian: true, GlutenFree: true),
                new("Affogato", "Vanilleeis mit einem heißen Espresso", 590, [Milk], Vegetarian: true, GlutenFree: true),
            ]),
        ],
        ["izakaya-kaze"] =
        [
            new("Mali tanjiri", "Za sto, za deljenje",
            [
                new("Edamame", "Mlada soja sa morskom solju", 45000, [Soy], "edamame", Vegetarian: true, Vegan: true, GlutenFree: true),
                new("Miso supa", "Sa tofuom, vakame algama i micubom", 49000, [Fish, Soy], "miso-soup"),
                new("Karaage", "Japanska pržena piletina sa kupusom i majonezom", 89000, [Gluten, Eggs, Soy], "karaage"),
                new("Gjoze (6 kom)", "Sa svinjetinom i kupusom, iz tiganja", 85000, [Gluten, Soy, Sesame]),
                new("Takojaki", "Loptice od testa sa hobotnicom, sosom i ljuspicama tune", 79000, [Gluten, Eggs, Fish, Molluscs]),
                new("Tempura od povrća", "Sa sosom tencuju", 79000, [Gluten, Eggs, Soy], Vegetarian: true),
            ]),
            new("Suši i sašimi", "Za šankom, pred vama",
            [
                new("Sašimi moriavase", "Žutorepa tuna, tuna i orada na listu šisoa, sa vasabijem", 249000, [Fish], "sashimi", GlutenFree: true, Recommended: true),
                new("Nigiri izbor (8 kom)", "Tuna, losos, škamp, jegulja i bela riba", 229000, [Fish, Crustaceans, Soy]),
                new("Maki sa lososom i krastavcem (8 kom)", null, 119000, [Fish, Soy], "maki"),
                new("Maki sa avokadom (8 kom)", null, 89000, [Soy], Vegetarian: true, Vegan: true),
            ]),
            new("Sa roštilja", "Robata na drvenom uglju",
            [
                new("Jakitori negima (2 kom)", "Piletina i praziluk u tare sosu", 69000, [Gluten, Soy]),
                new("Goveđi tataki", "Kratko pečena govedina sa belim lukom, mladim lukom i ponzu sosom", 189000, [Gluten, Soy], "beef-tataki", Recommended: true),
                new("Bakalar u misou", "Crni bakalar mariniran u misou tri dana", 289000, [Fish, Soy]),
                new("Šitake sa žara", "Sa sojinim sosom i limunom", 59000, [Soy], Vegetarian: true, Vegan: true),
            ]),
            new("Ramen", "Čorba se kuva dvanaest sati",
            [
                new("Tonkotsu ramen", "Čorba od svinjskih kostiju sa čašuom, mariniranim jajetom, crvenim đumbirom i uljem od crnog belog luka", 139000, [Gluten, Eggs, Soy, Sesame], "tonkotsu-ramen", Recommended: true),
                new("Šojo ramen", "Bistra pileća čorba sa sojinim sosom, piletinom i bambusom", 129000, [Gluten, Eggs, Soy, Fish]),
                new("Ramen sa povrćem", "Miso čorba sa tofuom i povrćem", 119000, [Gluten, Soy, Sesame], Vegetarian: true, Vegan: true),
            ]),
            new("Dezerti", null,
            [
                new("Sakura moći", "Pirinčani kolačići sa pastom od crvenog pasulja, u listu trešnje", 49000, [], "sakura-mochi", Vegetarian: true, Vegan: true, GlutenFree: true),
                new("Sladoled od matče", null, 45000, [Milk], Vegetarian: true, GlutenFree: true),
                new("Juzu šerbet", null, 42000, [], Vegetarian: true, Vegan: true, GlutenFree: true),
            ]),
        ],
        ["cafe-morgenrot"] =
        [
            new("Frühstück", "Den ganzen Tag, von 8 bis 16:30 Uhr",
            [
                new("Butter-Croissant", "Frisch aus dem Ofen, mit Butter und hausgemachter Marillenmarmelade", 390, [Gluten, Eggs, Milk], "croissant", Vegetarian: true),
                new("Wiener Frühstück", "Semmel, Kipferl, Butter, Marmelade und eine Melange", 890, [Gluten, Milk], Vegetarian: true),
                new("Eierspeise auf Bauernbrot", "Drei Eier vom Hof, mit Schnittlauch", 950, [Gluten, Eggs, Milk], Vegetarian: true),
                new("Chia-Joghurt-Bowl", "Joghurt mit Chia, Banane, Kiwi, Erdbeeren und Brombeeren", 980, [Milk], "chia-bowl", Vegetarian: true, GlutenFree: true),
                new("Porridge mit Hafermilch", "Mit Apfel, Zimt und gerösteten Walnüssen", 850, [Gluten, Nuts], Vegetarian: true, Vegan: true),
            ]),
            new("Brunch-Klassiker", "Ab 11 Uhr",
            [
                new("Shakshuka", "Vier Eier in würziger Paradeiser-Paprika-Sauce aus der Pfanne, mit Basilikum und Sauerteigbrot", 1390, [Gluten, Eggs], "shakshuka", Vegetarian: true, Spicy: true, Recommended: true),
                new("Eggs Benedict", "Pochierte Eier mit Sauce hollandaise und Beinschinken auf Toast, dazu Blattsalat", 1450, [Gluten, Eggs, Milk, Mustard], "eggs-benedict"),
                new("French Toast", "Mit Ricotta, frischen Beeren, Granatapfel und essbaren Blüten", 1250, [Gluten, Eggs, Milk], "french-toast", Vegetarian: true, Recommended: true),
                new("Waffel mit Joghurt und Beeren", "Belgische Waffel mit Joghurt, Heidelbeeren, Erdbeeren und Granola", 1190, [Gluten, Eggs, Milk], "waffles", Vegetarian: true),
                new("Toast-Sandwich", "Getoastet, mit Schinken, Käse, Ei, Paradeiser und Salat", 1050, [Gluten, Eggs, Milk, Mustard], "sandwich"),
                new("Avocado-Brot", "Vollkornbrot mit Avocado, Rosmarin, Sesam und Zitrone", 1090, [Gluten, Sesame], Vegetarian: true, Vegan: true),
            ]),
            new("Kuchen & Süßes", "Aus der eigenen Backstube",
            [
                new("Schokoladentorte", "Drei Schichten dunkle Schokolade mit Glasur", 520, [Gluten, Eggs, Milk], "chocolate-cake", Vegetarian: true),
                new("Marillenkuchen", "Mit Marillen aus der Wachau und Staubzucker", 480, [Gluten, Eggs, Milk], Vegetarian: true, Recommended: true),
                new("Topfenstrudel", "Warm, mit Vanillesauce", 520, [Gluten, Eggs, Milk], Vegetarian: true),
                new("Veganer Kuchen der Woche", "Fragen Sie uns, was heute in der Vitrine steht", 490, [Gluten], Vegetarian: true, Vegan: true),
            ]),
            new("Kaffee & Tee", "Hafer- und Sojamilch ohne Aufpreis",
            [
                new("Melange", null, 420, [Milk], Vegetarian: true, GlutenFree: true),
                new("Cappuccino", null, 410, [Milk], Vegetarian: true, GlutenFree: true),
                new("Espresso", null, 290, [], Vegan: true, GlutenFree: true),
                new("Chai Latte", "Mit Gewürzen und Honig", 450, [Milk], Vegetarian: true, GlutenFree: true),
            ]),
            new("Säfte", null,
            [
                new("Frisch gepresster Orangensaft 0,25 l", null, 450, [], Vegan: true, GlutenFree: true),
                new("Holundersaft gespritzt 0,5 l", "Hausgemacht, mit Soda", 390, [], Vegan: true, GlutenFree: true),
            ]),
        ],
    };

    /// <summary>
    /// Gives the demo restaurant <paramref name="slug"/> its menu, only when it has no menu sections yet, so a second run adds
    /// nothing and a menu the admin maintained stays as it is. A demo dish whose photo file was lost (same name, a photo in the demo)
    /// gets a new copy of its seed asset. <paramref name="db"/> is the restaurant's context; the caller saves.
    /// </summary>
    public static async Task SeedAsync(AppDbContext db, string slug, Func<string, string> copySeedAsset, Func<string?, bool> isLost)
    {
        if (!Menus.TryGetValue(slug, out var sections))
        {
            return;
        }
        string File(DemoItem item) => $"{slug}-menu-{item.Photo}.jpg";

        if (!await db.MenuSections.AnyAsync())
        {
            db.MenuSections.AddRange(sections.Select((section, s) => new MenuSection
            {
                Name = section.Name,
                Description = section.Description,
                SortOrder = s,
                Items = section.Items.Select((item, i) => new MenuItem
                {
                    Name = item.Name,
                    Description = item.Description,
                    Price = item.Price,
                    PhotoFileName = item.Photo is null ? null : copySeedAsset(File(item)),
                    SortOrder = i,
                    Vegetarian = item.Vegetarian,
                    Vegan = item.Vegan,
                    GlutenFree = item.GlutenFree,
                    Spicy = item.Spicy,
                    Recommended = item.Recommended,
                    Allergens = item.Allergens.Order().ToList(),
                }).ToList(),
            }));
            return;
        }

        var demoItems = sections.SelectMany(s => s.Items).Where(i => i.Photo is not null).ToList();
        foreach (var item in (await db.MenuItems.ToListAsync()).Where(i => isLost(i.PhotoFileName)))
        {
            if (demoItems.FirstOrDefault(d => d.Name == item.Name) is { } demoItem)
            {
                item.PhotoFileName = copySeedAsset(File(demoItem));
            }
        }
    }
}
