using System.IO.Compression;
using System.Net.Http.Json;
using Cbplayground.Api.Backups;
using Cbplayground.Api.Endpoints;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;

namespace Cbplayground.Api.Tests;

public sealed class BackupTests : IDisposable
{
    private readonly ApiFactory factory = new();
    private readonly string extractPath = Path.Combine(Path.GetTempPath(), $"cbplayground-tests-restore-{Guid.NewGuid():N}");

    private DatabaseBackup Backup => factory.Services.GetRequiredService<DatabaseBackup>();

    [Fact]
    public void Create_WritesTheDatabaseAndTheFloorPlansIntoOneZip()
    {
        Directory.CreateDirectory(factory.UploadsPath);
        File.WriteAllBytes(Path.Combine(factory.UploadsPath, "plan.png"), [1, 2, 3]);

        var file = Backup.Create(new DateTime(2026, 10, 31, 3, 0, 0));

        Assert.Equal(Path.Combine(factory.BackupPath, "cbplayground-20261031-030000.zip"), file);
        Assert.Equal([Path.GetFileName(file)], Directory.GetFiles(factory.BackupPath).Select(Path.GetFileName));

        ZipFile.ExtractToDirectory(file, extractPath);
        Assert.Equal([1, 2, 3], File.ReadAllBytes(Path.Combine(extractPath, "uploads", "plan.png")));

        var database = Assert.Single(Directory.GetFiles(extractPath, "*.db"));
        using var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = database, Pooling = false }.ToString());
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM Tenants";
        Assert.Equal(2L, command.ExecuteScalar());
    }

    [Fact]
    public async Task Create_ContainsTheLogoAndTheCoverOfTheRestaurants()
    {
        var ct = TestContext.Current.CancellationToken;
        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1];
        byte[] jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 2];
        using var admin = factory.CreateHttpsClient();
        (await admin.PostAsJsonAsync("/api/auth/login", new { email = "admin@zur-linde.test", password = ApiFactory.Password }, ct)).EnsureSuccessStatusCode();
        (await admin.PutAsync("/api/admin/branding/logo", new ByteArrayContent(png), ct)).EnsureSuccessStatusCode();
        var cover = await admin.PutAsync("/api/admin/branding/cover", new ByteArrayContent(jpeg), ct);
        var branding = (await cover.Content.ReadFromJsonAsync<BrandingEndpoints.BrandingResponse>(ct))!;

        var file = Backup.Create(new DateTime(2026, 11, 1, 3, 0, 0));

        ZipFile.ExtractToDirectory(file, extractPath);
        Assert.Equal(png, File.ReadAllBytes(Path.Combine(extractPath, "uploads", branding.LogoUrl!.Split("?v=")[1] + ".png")));
        Assert.Equal(jpeg, File.ReadAllBytes(Path.Combine(extractPath, "uploads", branding.CoverUrl!.Split("?v=")[1] + ".jpg")));
    }

    [Fact]
    public async Task Create_ContainsThePhotosOfTheAreas()
    {
        var ct = TestContext.Current.CancellationToken;
        byte[] jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 3];
        using var admin = factory.CreateHttpsClient();
        (await admin.PostAsJsonAsync("/api/auth/login", new { email = "admin@zur-linde.test", password = ApiFactory.Password }, ct)).EnsureSuccessStatusCode();
        var created = await admin.PostAsJsonAsync("/api/admin/areas", new { name = "Terrasse" }, ct);
        var area = (await created.Content.ReadFromJsonAsync<AreaEndpoints.AreaResponse>(ct))!;
        var upload = await admin.PutAsync($"/api/admin/areas/{area.Id}/photo", new ByteArrayContent(jpeg), ct);
        var photoUrl = (await upload.Content.ReadFromJsonAsync<AreaEndpoints.AreaResponse>(ct))!.PhotoUrl!;

        var file = Backup.Create(new DateTime(2026, 11, 1, 3, 0, 0));

        ZipFile.ExtractToDirectory(file, extractPath);
        Assert.Equal(jpeg, File.ReadAllBytes(Path.Combine(extractPath, "uploads", photoUrl.Split("?v=")[1] + ".jpg")));
    }

    [Fact]
    public async Task Create_ContainsTheGalleryPhotos()
    {
        var ct = TestContext.Current.CancellationToken;
        byte[] jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 4];
        byte[] webp = [.. "RIFF"u8, 0x24, 0x00, 0x00, 0x00, .. "WEBPVP8 "u8, 5];
        using var admin = factory.CreateHttpsClient();
        (await admin.PostAsJsonAsync("/api/auth/login", new { email = "admin@zur-linde.test", password = ApiFactory.Password }, ct)).EnsureSuccessStatusCode();
        var first = (await (await admin.PostAsync("/api/admin/gallery", new ByteArrayContent(jpeg), ct)).Content.ReadFromJsonAsync<GalleryEndpoints.GalleryPhotoResponse>(ct))!;
        var second = (await (await admin.PostAsync("/api/admin/gallery", new ByteArrayContent(webp), ct)).Content.ReadFromJsonAsync<GalleryEndpoints.GalleryPhotoResponse>(ct))!;

        var file = Backup.Create(new DateTime(2026, 11, 5, 3, 0, 0));

        ZipFile.ExtractToDirectory(file, extractPath);
        Assert.Equal(jpeg, File.ReadAllBytes(Path.Combine(extractPath, "uploads", first.Url.Split("?v=")[1] + ".jpg")));
        Assert.Equal(webp, File.ReadAllBytes(Path.Combine(extractPath, "uploads", second.Url.Split("?v=")[1] + ".webp")));
        var database = Assert.Single(Directory.GetFiles(extractPath, "*.db"));
        using var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = database, Pooling = false }.ToString());
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM GalleryPhotos";
        Assert.Equal(2L, command.ExecuteScalar());
    }

    [Fact]
    public void DeleteExpired_DeletesOnlyBackupsOlderThanTheRetentionPeriod()
    {
        Directory.CreateDirectory(factory.BackupPath);
        var now = new DateTime(2026, 10, 31, 3, 0, 0);
        string[] kept = ["cbplayground-20261031-030000.zip", "cbplayground-20261001-030000.zip", "notes.txt"];
        string[] expired = ["cbplayground-20261001-025959.zip", "cbplayground-20250101-030000.zip"];
        foreach (var name in kept.Concat(expired))
        {
            File.WriteAllText(Path.Combine(factory.BackupPath, name), "");
        }

        Backup.DeleteExpired(now);

        Assert.Equal(kept.Order(), Directory.GetFiles(factory.BackupPath).Select(Path.GetFileName).Order());
    }

    [Fact]
    public void LatestBackupTime_IsTheNewestBackup()
    {
        Assert.Null(Backup.LatestBackupTime());

        Directory.CreateDirectory(factory.BackupPath);
        File.WriteAllText(Path.Combine(factory.BackupPath, "cbplayground-20261029-030000.zip"), "");
        File.WriteAllText(Path.Combine(factory.BackupPath, "cbplayground-20261030-030000.zip"), "");

        Assert.Equal(new DateTime(2026, 10, 30, 3, 0, 0), Backup.LatestBackupTime());
    }

    [Theory]
    [InlineData("2026-10-31 02:59", "2026-10-31 03:00")]
    [InlineData("2026-10-31 03:00", "2026-11-01 03:00")]
    [InlineData("2026-10-31 18:00", "2026-11-01 03:00")]
    public void NextRun_IsTheNextTimeOfDay(string now, string expected)
    {
        Assert.Equal(DateTime.Parse(expected), DatabaseBackupService.NextRun(DateTime.Parse(now), new TimeOnly(3, 0)));
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData("2026-10-30 03:00", true)]
    [InlineData("2026-10-30 03:01", false)]
    public void IsOverdue_WhenThereIsNoBackupOfTheLastDay(string? latest, bool expected)
    {
        var latestBackup = latest is null ? (DateTime?)null : DateTime.Parse(latest);
        Assert.Equal(expected, DatabaseBackupService.IsOverdue(latestBackup, new DateTime(2026, 10, 31, 3, 0, 0)));
    }

    public void Dispose()
    {
        factory.Dispose();
        if (Directory.Exists(extractPath))
        {
            Directory.Delete(extractPath, recursive: true);
        }
    }
}
