namespace Cbplayground.Api.Data;

/// <summary>A frequently asked question of a restaurant with its answer, shown to guests under "Good to know" in its order.</summary>
public class RestaurantFaq : ITenantOwned
{
    public const int MaxQuestionLength = 150;
    public const int MaxAnswerLength = 600;

    /// <summary>The most questions a restaurant can have.</summary>
    public const int MaxPerRestaurant = 12;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    /// <summary>Trimmed, 1 to <see cref="MaxQuestionLength"/> characters, in the restaurant's language.</summary>
    public required string Question { get; set; }

    /// <summary>Trimmed, 1 to <see cref="MaxAnswerLength"/> characters, in the restaurant's language; line breaks are kept.</summary>
    public required string Answer { get; set; }

    /// <summary>Position of the question in the list, ascending.</summary>
    public int SortOrder { get; set; }
}
