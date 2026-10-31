namespace Cbplayground.Api.Endpoints;

/// <summary>Body of a failed request, e.g. <c>{ "error": "table_number_taken" }</c>. The web frontend translates the code.</summary>
public record ErrorResponse(string Error)
{
    public static IResult Result(string error, int statusCode) => Results.Json(new ErrorResponse(error), statusCode: statusCode);
}
