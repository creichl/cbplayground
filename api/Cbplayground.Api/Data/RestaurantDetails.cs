using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>A cuisine a restaurant offers. The list is fixed, the same for every restaurant; the web translates the names.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<Cuisine>))]
public enum Cuisine
{
    Bavarian,
    German,
    Austrian,
    Serbian,
    Balkan,
    Italian,
    Mediterranean,
    French,
    Japanese,
    Asian,
    International,
    Vegetarian,
    CafeBrunch,
    BarCocktails,
    SteakGrill,
    FishSeafood,
}

/// <summary>A feature of a restaurant guests look for, e.g. a terrace. The list is fixed, the same for every restaurant; the web translates the names.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<RestaurantFeature>))]
public enum RestaurantFeature
{
    Terrace,
    Garden,
    Rooftop,
    View,
    WheelchairAccessible,
    DogsWelcome,
    ChildFriendly,
    VegetarianOptions,
    VeganOptions,
    GlutenFreeOptions,
    LiveMusic,
    PrivateDining,
    Parking,
    CardPayment,
    Wifi,
}
