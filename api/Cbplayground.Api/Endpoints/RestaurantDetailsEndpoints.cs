using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The details of the signed-in Tenant Admin's restaurant that guests look for (cuisines, price level, features, house rules)
/// and its frequently asked questions. Guests get them with the restaurant (<see cref="PublicRestaurantEndpoints"/>); the
/// restaurant list (<see cref="TenantEndpoints"/>) carries cuisines, price level and features. Questions of another restaurant
/// are 404 like unknown ones.
/// </summary>
public static class RestaurantDetailsEndpoints
{
    /// <summary>
    /// The details: <see cref="Cuisines"/> in the admin's order, the main one first; <see cref="Features"/> in the order of
    /// <see cref="RestaurantFeature"/>; <see cref="PriceLevel"/> and <see cref="HouseRules"/> null when not set.
    /// </summary>
    public record DetailsResponse(IReadOnlyList<Cuisine> Cuisines, int? PriceLevel, IReadOnlyList<RestaurantFeature> Features, string? HouseRules);

    /// <summary>
    /// The new details; missing lists are empty, a cuisine named twice counts once. The house rules are trimmed, empty ones are
    /// stored as null. Errors (400): "invalid_cuisine" (a name outside <see cref="Cuisine"/>), "too_many_cuisines" (more than
    /// <see cref="Tenant.MaxCuisines"/>), "invalid_price_level" (outside 1–4), "invalid_feature" (a name outside
    /// <see cref="RestaurantFeature"/>), "invalid_house_rules" (longer than <see cref="Tenant.MaxHouseRulesLength"/> characters).
    /// </summary>
    public record DetailsRequest(List<string>? Cuisines, int? PriceLevel, List<string>? Features, string? HouseRules);

    /// <summary>A frequently asked question in the admin list.</summary>
    public record FaqResponse(Guid Id, string Question, string Answer);

    /// <summary>
    /// A new or changed question; both are trimmed. Errors (400): "invalid_question" (empty or longer than
    /// <see cref="RestaurantFaq.MaxQuestionLength"/>), "invalid_answer" (empty or longer than <see cref="RestaurantFaq.MaxAnswerLength"/>);
    /// adding to a full list (<see cref="RestaurantFaq.MaxPerRestaurant"/>) is 409 "faq_full".
    /// </summary>
    public record FaqRequest(string? Question, string? Answer);

    /// <summary>All question ids in their new order, each exactly once; otherwise 400 "invalid_order".</summary>
    public record ReorderFaqRequest(List<Guid>? Ids);

    /// <summary>A frequently asked question as guests see it.</summary>
    public record PublicFaq(string Question, string Answer);

    public static void MapRestaurantDetailsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/details", async (ITenantContext tenantContext, AppDbContext db) =>
            ToResponse(await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId)));

        group.MapPut("/details", async (DetailsRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            var cuisineNames = (request.Cuisines ?? []).Distinct().ToList();
            if (cuisineNames.Any(name => !Enum.GetNames<Cuisine>().Contains(name)))
            {
                return ErrorResponse.Result("invalid_cuisine", StatusCodes.Status400BadRequest);
            }
            if (cuisineNames.Count > Tenant.MaxCuisines)
            {
                return ErrorResponse.Result("too_many_cuisines", StatusCodes.Status400BadRequest);
            }
            if (request.PriceLevel is < Tenant.MinPriceLevel or > Tenant.MaxPriceLevel)
            {
                return ErrorResponse.Result("invalid_price_level", StatusCodes.Status400BadRequest);
            }
            var featureNames = request.Features ?? [];
            if (featureNames.Any(name => !Enum.GetNames<RestaurantFeature>().Contains(name)))
            {
                return ErrorResponse.Result("invalid_feature", StatusCodes.Status400BadRequest);
            }
            var houseRules = string.IsNullOrWhiteSpace(request.HouseRules) ? null : request.HouseRules.Trim();
            if (houseRules?.Length > Tenant.MaxHouseRulesLength)
            {
                return ErrorResponse.Result("invalid_house_rules", StatusCodes.Status400BadRequest);
            }

            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            tenant.Cuisines = cuisineNames.Select(Enum.Parse<Cuisine>).ToList();
            tenant.PriceLevel = request.PriceLevel;
            tenant.Features = Enum.GetValues<RestaurantFeature>().Where(feature => featureNames.Contains(feature.ToString())).ToList();
            tenant.HouseRules = houseRules;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(tenant));
        });

        // The query filter limits the questions to the current restaurant.
        group.MapGet("/faq", async (AppDbContext db) => await ListAsync(db));

        // Adds a question at the end.
        group.MapPost("/faq", async (FaqRequest request, AppDbContext db) =>
        {
            var (question, answer, error) = Validate(request);
            if (error is not null)
            {
                return error;
            }
            if (await db.RestaurantFaqs.CountAsync() >= RestaurantFaq.MaxPerRestaurant)
            {
                return ErrorResponse.Result("faq_full", StatusCodes.Status409Conflict);
            }

            var sortOrder = await db.RestaurantFaqs.Select(f => (int?)f.SortOrder).MaxAsync() is { } max ? max + 1 : 0;
            var faq = new RestaurantFaq { Question = question!, Answer = answer!, SortOrder = sortOrder };
            db.RestaurantFaqs.Add(faq);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/faq/{faq.Id}", ToResponse(faq));
        });

        group.MapPut("/faq/{id:guid}", async (Guid id, FaqRequest request, AppDbContext db) =>
        {
            var faq = await db.RestaurantFaqs.SingleOrDefaultAsync(f => f.Id == id);
            if (faq is null)
            {
                return Results.NotFound();
            }
            var (question, answer, error) = Validate(request);
            if (error is not null)
            {
                return error;
            }

            faq.Question = question!;
            faq.Answer = answer!;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(faq));
        });

        group.MapDelete("/faq/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var faq = await db.RestaurantFaqs.SingleOrDefaultAsync(f => f.Id == id);
            if (faq is null)
            {
                return Results.NotFound();
            }

            db.RestaurantFaqs.Remove(faq);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPut("/faq/order", async (ReorderFaqRequest request, AppDbContext db) =>
        {
            var faqs = await db.RestaurantFaqs.ToListAsync();
            var ids = request.Ids ?? [];
            if (ids.Count != faqs.Count || ids.Distinct().Count() != ids.Count || faqs.Any(f => !ids.Contains(f.Id)))
            {
                return ErrorResponse.Result("invalid_order", StatusCodes.Status400BadRequest);
            }

            foreach (var faq in faqs)
            {
                faq.SortOrder = ids.IndexOf(faq.Id);
            }
            await db.SaveChangesAsync();
            return Results.Ok(faqs.OrderBy(f => f.SortOrder).Select(ToResponse).ToList());
        });
    }

    /// <summary>The questions of the current restaurant in their order, as guests see them.</summary>
    internal static async Task<List<PublicFaq>> PublicListAsync(AppDbContext db) =>
        (await ListAsync(db)).Select(f => new PublicFaq(f.Question, f.Answer)).ToList();

    private static async Task<List<FaqResponse>> ListAsync(AppDbContext db) =>
        (await db.RestaurantFaqs.OrderBy(f => f.SortOrder).ToListAsync()).Select(ToResponse).ToList();

    /// <summary>The trimmed question and answer, or the error of the first invalid one.</summary>
    private static (string? Question, string? Answer, IResult? Error) Validate(FaqRequest request)
    {
        var question = request.Question?.Trim() ?? "";
        if (question.Length is 0 or > RestaurantFaq.MaxQuestionLength)
        {
            return (null, null, ErrorResponse.Result("invalid_question", StatusCodes.Status400BadRequest));
        }
        var answer = request.Answer?.Trim() ?? "";
        if (answer.Length is 0 or > RestaurantFaq.MaxAnswerLength)
        {
            return (null, null, ErrorResponse.Result("invalid_answer", StatusCodes.Status400BadRequest));
        }
        return (question, answer, null);
    }

    private static DetailsResponse ToResponse(Tenant tenant) => new(tenant.Cuisines, tenant.PriceLevel, tenant.Features, tenant.HouseRules);

    private static FaqResponse ToResponse(RestaurantFaq faq) => new(faq.Id, faq.Question, faq.Answer);
}
