using Cbplayground.Api.Data;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Cbplayground.Api.Tests;

/// <summary>The reset of the demo data before the start (<c>dotnet run -- --reset-demo-data</c>), on a temporary data folder.</summary>
public sealed class DemoDataResetTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), $"cbplayground-tests-reset-{Guid.NewGuid():N}");

    private string DataPath => Path.Combine(directory, "data");
    private string DatabasePath => Path.Combine(DataPath, "cbplayground.db");
    private string UploadsPath => Path.Combine(DataPath, "uploads");
    private string ConnectionString => $"Data Source={DatabasePath}";

    public DemoDataResetTests()
    {
        Directory.CreateDirectory(Path.Combine(UploadsPath, "old"));
        Directory.CreateDirectory(Path.Combine(DataPath, "keys"));
        Directory.CreateDirectory(Path.Combine(DataPath, "backups"));
        foreach (var file in new[]
        {
            DatabasePath, $"{DatabasePath}-wal", $"{DatabasePath}-shm",
            Path.Combine(UploadsPath, "plan.webp"), Path.Combine(UploadsPath, "old", "logo.png"),
            Path.Combine(DataPath, "keys", "key-1.xml"), Path.Combine(DataPath, "backups", "cbplayground-20261031-030000.zip"),
            Path.Combine(DataPath, "other.db"),
        })
        {
            File.WriteAllText(file, "content");
        }
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    [InlineData("Testing")]
    public void Outside_Development_the_reset_aborts_the_start_and_deletes_nothing(string environmentName)
    {
        var before = AllFiles();

        var error = Assert.Throws<InvalidOperationException>(() => DemoDataReset.Run(new Environment(environmentName), ConnectionString, UploadsPath));

        Assert.Contains("--reset-demo-data", error.Message);
        Assert.Contains("Development", error.Message);
        Assert.Equal(before, AllFiles());
    }

    [Fact]
    public void In_Development_the_reset_deletes_the_database_and_empties_the_uploads_folder_but_nothing_else()
    {
        DemoDataReset.Run(new Environment(Environments.Development), ConnectionString, UploadsPath);

        Assert.False(File.Exists(DatabasePath));
        Assert.False(File.Exists($"{DatabasePath}-wal"));
        Assert.False(File.Exists($"{DatabasePath}-shm"));
        Assert.True(Directory.Exists(UploadsPath));
        Assert.Empty(Directory.EnumerateFileSystemEntries(UploadsPath));
        // The sign-in keys, the backups and other files in the data folder stay.
        Assert.Equal(
            new[] { Path.Combine("backups", "cbplayground-20261031-030000.zip"), Path.Combine("keys", "key-1.xml"), "other.db" },
            AllFiles());
    }

    [Fact]
    public void On_a_fresh_checkout_the_reset_has_nothing_to_delete()
    {
        Directory.Delete(directory, recursive: true);

        DemoDataReset.Run(new Environment(Environments.Development), ConnectionString, UploadsPath);

        Assert.False(Directory.Exists(directory));
    }

    private string[] AllFiles() =>
        [.. Directory.GetFiles(DataPath, "*", SearchOption.AllDirectories).Select(f => Path.GetRelativePath(DataPath, f)).Order()];

    public void Dispose()
    {
        if (Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    private sealed class Environment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "Cbplayground.Api";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
