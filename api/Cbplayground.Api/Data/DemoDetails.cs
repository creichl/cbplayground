using Microsoft.EntityFrameworkCore;
using static Cbplayground.Api.Data.Cuisine;
using static Cbplayground.Api.Data.RestaurantFeature;

namespace Cbplayground.Api.Data;

/// <summary>
/// The details and frequently asked questions of the demo restaurants of the development seed (<see cref="DevelopmentSeed"/>),
/// by slug, in the restaurant's language.
/// </summary>
public static class DemoDetails
{
    private record Demo(Cuisine[] Cuisines, int PriceLevel, RestaurantFeature[] Features, string HouseRules, (string Question, string Answer)[] Faq);

    private static readonly Dictionary<string, Demo> Restaurants = new()
    {
        ["zur-linde"] = new(
            [Bavarian],
            2,
            [Terrace, Garden, ChildFriendly, DogsWelcome, VegetarianOptions, Parking, CardPayment],
            "Bei schönem Wetter vergeben wir die Terrasse nach Reservierung, Biergartentische ohne Reservierung nach Ankunft.\n"
            + "Ab 22 Uhr bitten wir auf der Terrasse um Rücksicht auf unsere Nachbarn.\n"
            + "Reservierte Tische halten wir 15 Minuten für Sie frei.",
            [
                ("Darf ich meinen Hund mitbringen?", "Ja, gerne! Hunde sind in der Gaststube und auf der Terrasse willkommen. Einen Wassernapf bringen wir gleich mit."),
                ("Gibt es ein Kindermenü?", "Ja. Für unsere kleinen Gäste gibt es Kinderportionen wie Wiener Schnitzel mit Pommes oder Kaiserschmarrn, dazu Hochstühle und Malstifte."),
                ("Kann ich mit einer größeren Gruppe kommen?", "Gruppen bis 8 Personen reservieren Sie direkt online. Für größere Gesellschaften, Geburtstage oder Weihnachtsfeiern rufen Sie uns bitte an, wir richten gern die ganze Stube her."),
                ("Wo kann ich parken?", "Hinter dem Haus haben wir 12 kostenlose Parkplätze für unsere Gäste. Die nächste U-Bahn-Haltestelle ist nur 5 Gehminuten entfernt."),
                ("Gibt es vegetarische Gerichte?", "Ja, zum Beispiel Kasspatzn mit Röstzwiebeln, Schwammerl in Rahmsoße mit Semmelknödel und wechselnde Tagesgerichte."),
            ]),
        ["kafana-dunav"] = new(
            [Serbian, Balkan],
            2,
            [Garden, View, LiveMusic, ChildFriendly, VegetarianOptions, CardPayment, Wifi],
            "Petkom i subotom od 20 časova sviraju tamburaši; za stolove u blizini muzike preporučujemo rezervaciju.\n"
            + "Rezervisani sto čuvamo 20 minuta.\n"
            + "U bašti je dozvoljeno pušenje, u sali nije.",
            [
                ("Kada sviraju tamburaši?", "Petkom i subotom od 20 do 23 časa. Pesme po želji su dobrodošle, a bakšiš ide pravo muzičarima."),
                ("Da li je bašta otvorena po lošem vremenu?", "Bašta ima tendu i grejalice, pa je otvorena od aprila do oktobra. Kad pada jak kiša, rado vas premeštamo u salu."),
                ("Mogu li da organizujem proslavu?", "Naravno. Za rođendane, krštenja i druga slavlja do 40 osoba pripremamo poseban meni. Pozovite nas da se dogovorimo."),
                ("Imate li jela bez mesa?", "Da: posna riblja čorba, prebranac, gibanica, ajvar sa domaćim hlebom i salate iz bašte."),
                ("Da li mogu da platim karticom?", "Da, primamo sve kartice i plaćanje telefonom."),
            ]),
        ["rooftop-belvedere"] = new(
            [BarCocktails, Mediterranean],
            3,
            [Rooftop, View, WheelchairAccessible, VegetarianOptions, VeganOptions, CardPayment, Wifi],
            "Dresscode: smart casual. Bitte keine Sportkleidung, Badeschlapfen oder Herren in ärmellosen Shirts.\n"
            + "Zutritt ab 18 Jahren, in Begleitung Erwachsener bis 20 Uhr auch jünger.\n"
            + "Reservierte Tische halten wir 15 Minuten frei; auf der Dachterrasse ist die Sitzzeit am Freitag und Samstag auf 2 Stunden begrenzt.",
            [
                ("Was passiert bei Regen oder Gewitter?", "Bei schlechtem Wetter setzen wir Sie in die Lounge hinter den Panoramafenstern, mit demselben Blick über die Dächer. Ihre Reservierung bleibt bestehen."),
                ("Ab welchem Alter darf man kommen?", "Ab 18 Jahren. Bis 20 Uhr sind auch jüngere Gäste in Begleitung Erwachsener willkommen."),
                ("Gibt es einen Lift?", "Ja, ein Lift fährt vom Eingang in der Prinz-Eugen-Straße direkt auf die Dachterrasse. Die Terrasse und die Lounge sind stufenlos erreichbar."),
                ("Kann ich die Dachterrasse für eine Feier mieten?", "Für Firmenfeiern und private Events bis 80 Personen bieten wir die ganze Terrasse exklusiv an. Schreiben Sie uns an info@rooftop-belvedere.example."),
            ]),
        ["il-faro"] = new(
            [Italian, Mediterranean],
            2,
            [Terrace, View, ChildFriendly, VegetarianOptions, GlutenFreeOptions, PrivateDining, CardPayment],
            "Auf der Terrazza servieren wir von Mai bis September; bei Regen finden wir für Sie einen Platz in der Sala.\n"
            + "Reservierungsanfragen bestätigen wir in der Regel innerhalb von zwei Stunden per E-Mail.\n"
            + "Reservierte Tische halten wir 15 Minuten für Sie frei.",
            [
                ("Warum muss ich auf die Bestätigung warten?", "Wir schauen uns jede Anfrage selbst an, damit Sie genau den Tisch bekommen, den Sie auf dem Plan ausgesucht haben. Meist bestätigen wir innerhalb von zwei Stunden."),
                ("Sieht man von der Terrazza das Wasser?", "Ja, von den vorderen Tischen der Terrazza blicken Sie über die Elbe auf die Kräne des Hafens. Wählen Sie diese Tische bei der Reservierung direkt auf dem Plan."),
                ("Gibt es glutenfreie Pasta?", "Jede Pasta bereiten wir auf Wunsch mit glutenfreien Nudeln zu. Bitte sagen Sie uns bei der Reservierung Bescheid, dann ist die Küche vorbereitet."),
                ("Kann ich die Sala für eine Feier reservieren?", "Für Feiern bis 40 Personen gehört Ihnen die ganze Sala. Wir stellen gern ein Menü mit Antipasti, Pasta und Dolci zusammen, rufen Sie uns einfach an."),
                ("Wie komme ich zu Ihnen?", "Mit der S-Bahn bis Landungsbrücken, von dort sind es fünf Minuten zu Fuß am Wasser entlang. Autos parken am besten im Parkhaus am Hafen."),
            ]),
        ["cafe-morgenrot"] = new(
            [CafeBrunch],
            1,
            [Garden, ChildFriendly, DogsWelcome, VegetarianOptions, VeganOptions, CardPayment, Wifi],
            "Ein reservierter Tisch gehört Ihnen 60 Minuten, ab 5 Personen 90 Minuten; ist danach frei, bleiben Sie gern länger.\n"
            + "Reservierte Tische halten wir 10 Minuten frei.\n"
            + "Am Wochenende bitten wir darum, den Laptop zu Hause zu lassen.",
            [
                ("Bis wann gibt es Frühstück?", "Den ganzen Tag, von 8 bis 16:30 Uhr. Ab 11 Uhr kommen unsere Brunch-Klassiker und die hausgemachten Kuchen dazu."),
                ("Gibt es veganes Frühstück?", "Ja, zum Beispiel Porridge mit Hafermilch, Avocado-Brot und einen veganen Kuchen der Woche. Hafer- und Sojamilch gibt es zu jedem Kaffee ohne Aufpreis."),
                ("Warum ist ein Tisch nur 60 Minuten reserviert?", "Damit am Vormittag möglichst viele Gäste einen Platz bekommen. Ab 5 Personen planen wir 90 Minuten ein, und wenn nach Ihnen niemand reserviert hat, bleiben Sie natürlich länger."),
                ("Darf mein Hund mit?", "Ja, im Café und im Gastgarten. Ein Wassernapf steht gleich beim Eingang."),
                ("Ist der Gastgarten im Winter offen?", "Der Gastgarten hat von April bis Oktober geöffnet. In der kalten Jahreszeit reservieren Sie bitte einen Tisch im Café."),
            ]),
        ["izakaya-kaze"] = new(
            [Japanese, Asian],
            3,
            [VegetarianOptions, GlutenFreeOptions, PrivateDining, CardPayment, Wifi],
            "Za šankom sedite u paru i gledate kako kuvari spremaju jela pred vama.\n"
            + "Rezervisani sto čuvamo 15 minuta.\n"
            + "U restoranu se ne puši, ni za stolom ni za šankom.",
            [
                ("Šta je izakaja?", "Izakaja je japanska kafana: mesto gde se posle posla sedi uz piće i male tanjire koji se dele. Naručite više jela za sto i probajte od svega."),
                ("Mogu li da sednem za šank?", "Da. Mesta za šankom rezervišete kao sto za dvoje u delu „Bar“. Odatle gledate kako kuvari spremaju suši i jakitori."),
                ("Imate li jela bez mesa i ribe?", "Da: edamame, miso supu, tempuru od povrća i ramen sa povrćem. Recite nam pri rezervaciji ako imate alergiju, kuhinja će se prilagoditi."),
                ("Imate li sake?", "Imamo desetak vrsta sakea, toplog i hladnog, kao i japanski viski i koktele sa japanskim notama. Rado vam preporučimo sake uz jela."),
                ("Da li primate veće grupe?", "Grupe do 8 osoba rezervišu online. Za veća društva i privatne večeri pozovite nas, salu možemo zatvoriti samo za vas."),
            ]),
    };

    /// <summary>
    /// Sets the details and questions of the demo restaurant <paramref name="slug"/>, but only while none of its details and no
    /// question are set, so what the admin maintained stays. <paramref name="db"/> has the restaurant as its tenant; the caller saves.
    /// </summary>
    public static async Task SeedAsync(AppDbContext db, string slug)
    {
        if (!Restaurants.TryGetValue(slug, out var demo))
        {
            return;
        }
        var tenant = await db.Tenants.SingleAsync(t => t.Slug == slug);
        if (tenant is not { Cuisines: [], PriceLevel: null, Features: [], HouseRules: null } || await db.RestaurantFaqs.AnyAsync())
        {
            return;
        }

        tenant.Cuisines = [.. demo.Cuisines];
        tenant.PriceLevel = demo.PriceLevel;
        tenant.Features = [.. Enum.GetValues<RestaurantFeature>().Where(demo.Features.Contains)];
        tenant.HouseRules = demo.HouseRules;
        db.RestaurantFaqs.AddRange(demo.Faq.Select((faq, i) => new RestaurantFaq { Question = faq.Question, Answer = faq.Answer, SortOrder = i }));
    }
}
