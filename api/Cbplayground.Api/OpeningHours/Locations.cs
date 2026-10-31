namespace Cbplayground.Api.OpeningHours;

/// <summary>The countries and regions a restaurant can be in, with the time zone of each country.</summary>
public static class Locations
{
    public const string Germany = "DE";
    public const string Austria = "AT";
    public const string Serbia = "RS";

    /// <summary>The IANA time zone of each supported country.</summary>
    public static readonly IReadOnlyDictionary<string, string> TimeZones = new Dictionary<string, string>
    {
        [Germany] = "Europe/Berlin",
        [Austria] = "Europe/Vienna",
        [Serbia] = "Europe/Belgrade",
    };

    /// <summary>The 16 German federal states (ISO 3166-2). Only Germany has regions.</summary>
    public static readonly IReadOnlySet<string> GermanStates = new HashSet<string>
    {
        "DE-BW", // Baden-Württemberg
        "DE-BY", // Bayern
        "DE-BE", // Berlin
        "DE-BB", // Brandenburg
        "DE-HB", // Bremen
        "DE-HH", // Hamburg
        "DE-HE", // Hessen
        "DE-MV", // Mecklenburg-Vorpommern
        "DE-NI", // Niedersachsen
        "DE-NW", // Nordrhein-Westfalen
        "DE-RP", // Rheinland-Pfalz
        "DE-SL", // Saarland
        "DE-SN", // Sachsen
        "DE-ST", // Sachsen-Anhalt
        "DE-SH", // Schleswig-Holstein
        "DE-TH", // Thüringen
    };
}
