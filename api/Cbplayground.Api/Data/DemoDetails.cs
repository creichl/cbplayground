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
