namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The uploaded images (floor plans, logos and cover images) in the folder "Uploads:Path", which the daily backup takes along.
/// The body of an upload is the image itself, PNG, JPEG or WebP; the type is detected from the content and the file name is
/// chosen by the server, so a new upload always gets a new file name.
/// </summary>
public static class ImageUploads
{
    /// <summary>The error (415) for content that is not a PNG, JPEG or WebP image, for every kind of upload.</summary>
    public const string TypeInvalidError = "floor_plan_type_invalid";

    /// <summary>The folder of the uploaded images, "Uploads:Path" in the configuration, relative to the content root.</summary>
    public static string UploadsDirectory(IConfiguration configuration, IWebHostEnvironment environment) =>
        Path.GetFullPath(Path.Combine(environment.ContentRootPath, configuration["Uploads:Path"] ?? "data/uploads"));

    /// <summary>
    /// Stores the image in the body of the request under a new file name and returns that name, or the error:
    /// 413 <paramref name="tooLargeError"/> above <paramref name="maxBytes"/>, 415 <see cref="TypeInvalidError"/> for anything but PNG, JPEG or WebP.
    /// </summary>
    public static async Task<(string? FileName, IResult? Error)> SaveAsync(HttpRequest request, long maxBytes, string tooLargeError,
        IConfiguration configuration, IWebHostEnvironment environment, CancellationToken cancellationToken)
    {
        var tooLarge = ErrorResponse.Result(tooLargeError, StatusCodes.Status413PayloadTooLarge);
        if (request.ContentLength > maxBytes)
        {
            return (null, tooLarge);
        }

        using var content = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await request.Body.ReadAsync(chunk, cancellationToken)) > 0)
        {
            content.Write(chunk, 0, read);
            if (content.Length > maxBytes)
            {
                return (null, tooLarge);
            }
        }

        var extension = DetectImageExtension(content.GetBuffer().AsSpan(0, (int)content.Length));
        if (extension is null)
        {
            return (null, ErrorResponse.Result(TypeInvalidError, StatusCodes.Status415UnsupportedMediaType));
        }

        var directory = UploadsDirectory(configuration, environment);
        Directory.CreateDirectory(directory);
        var fileName = $"{Guid.NewGuid():N}{extension}";
        await File.WriteAllBytesAsync(Path.Combine(directory, fileName), content.ToArray(), cancellationToken);
        return (fileName, null);
    }

    /// <summary>Deletes the uploaded file; nothing without a file name.</summary>
    public static void Delete(IConfiguration configuration, IWebHostEnvironment environment, string? fileName)
    {
        if (fileName is not null)
        {
            File.Delete(Path.Combine(UploadsDirectory(configuration, environment), fileName));
        }
    }

    /// <summary>The version of an image in its URL (<c>?v=</c>): its file name without extension, which changes with every upload.</summary>
    public static string Version(string fileName) => Path.GetFileNameWithoutExtension(fileName);

    /// <summary>The uploaded image with the given Cache-Control header; 404 without file name or file.</summary>
    public static IResult Read(HttpContext httpContext, IConfiguration configuration, IWebHostEnvironment environment, string? fileName, string cacheControl)
    {
        if (fileName is null)
        {
            return Results.NotFound();
        }

        var path = Path.Combine(UploadsDirectory(configuration, environment), fileName);
        if (!File.Exists(path))
        {
            return Results.NotFound();
        }

        httpContext.Response.Headers.CacheControl = cacheControl;
        httpContext.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.File(path, ContentTypeOf(fileName));
    }

    /// <summary>The file extension for a PNG, JPEG or WebP image, detected from its first bytes; null for anything else (SVG and GIF included).</summary>
    private static string? DetectImageExtension(ReadOnlySpan<byte> content)
    {
        if (content.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
        {
            return ".png";
        }
        if (content.StartsWith((ReadOnlySpan<byte>)[0xFF, 0xD8, 0xFF]))
        {
            return ".jpg";
        }
        if (content.Length >= 12 && content[..4].SequenceEqual("RIFF"u8) && content[8..12].SequenceEqual("WEBP"u8))
        {
            return ".webp";
        }
        return null;
    }

    private static string ContentTypeOf(string fileName) => Path.GetExtension(fileName) switch
    {
        ".png" => "image/png",
        ".jpg" => "image/jpeg",
        ".webp" => "image/webp",
        _ => "application/octet-stream",
    };
}
