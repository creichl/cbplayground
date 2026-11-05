using System.Net;
using System.Net.Sockets;
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

        var error = Assert.Throws<InvalidOperationException>(() => DemoDataReset.Run(new Environment(environmentName), ConnectionString, UploadsPath, urls: null));

        Assert.Contains("--reset-demo-data", error.Message);
        Assert.Contains("Development", error.Message);
        Assert.Equal(before, AllFiles());
    }

    [Fact]
    public void In_Development_the_reset_deletes_the_database_and_empties_the_uploads_folder_but_nothing_else()
    {
        DemoDataReset.Run(new Environment(Environments.Development), ConnectionString, UploadsPath, urls: null);

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

        DemoDataReset.Run(new Environment(Environments.Development), ConnectionString, UploadsPath, urls: null);

        Assert.False(Directory.Exists(directory));
    }

    [Theory]
    [InlineData("http://localhost:{0}")]
    [InlineData("http://+:{0}")]
    [InlineData("https://localhost:7000;http://localhost:{0}")]
    public void While_something_listens_on_the_API_address_the_reset_aborts_and_deletes_nothing(string urls)
    {
        // An API that is still running, e.g. one started before the database lock existed, which holds no lock.
        var runningApi = new TcpListener(IPAddress.Loopback, 0);
        runningApi.Start();
        try
        {
            var port = ((IPEndPoint)runningApi.LocalEndpoint).Port;
            var before = AllFiles();

            var error = Assert.Throws<InvalidOperationException>(
                () => DemoDataReset.Run(new Environment(Environments.Development), ConnectionString, UploadsPath, string.Format(urls, port)));

            Assert.Contains("already listening", error.Message);
            Assert.Contains($"lsof -i :{port}", error.Message);
            Assert.Contains("Nothing was deleted", error.Message);
            Assert.Equal(before, AllFiles());
        }
        finally
        {
            runningApi.Stop();
        }
    }

    [Fact]
    public void When_nothing_listens_on_the_API_address_the_reset_deletes()
    {
        var stoppedApi = new TcpListener(IPAddress.Loopback, 0);
        stoppedApi.Start();
        var port = ((IPEndPoint)stoppedApi.LocalEndpoint).Port;
        stoppedApi.Stop();

        DemoDataReset.Run(new Environment(Environments.Development), ConnectionString, UploadsPath, $"http://localhost:{port}");

        Assert.False(File.Exists(DatabasePath));
        Assert.Empty(Directory.EnumerateFileSystemEntries(UploadsPath));
    }

    [Fact]
    public void A_second_API_on_the_same_database_cannot_take_the_lock_and_deletes_nothing()
    {
        using var runningApi = DemoDataReset.Lock(ConnectionString);
        Assert.NotNull(runningApi);
        var before = AllFiles();

        var error = Assert.Throws<InvalidOperationException>(() => DemoDataReset.Lock(ConnectionString));

        Assert.Contains("already running", error.Message);
        Assert.Contains(DatabasePath, error.Message);
        Assert.Contains("--reset-demo-data", error.Message);
        Assert.Equal(before, AllFiles());
    }

    [Fact]
    public void Once_the_running_API_has_stopped_the_next_start_takes_the_lock()
    {
        DemoDataReset.Lock(ConnectionString)!.Dispose();

        using var nextStart = DemoDataReset.Lock(ConnectionString);

        Assert.NotNull(nextStart);
    }

    [Fact]
    public void On_a_fresh_checkout_the_lock_creates_the_data_folder()
    {
        Directory.Delete(directory, recursive: true);

        using var firstStart = DemoDataReset.Lock(ConnectionString);

        Assert.True(File.Exists($"{DatabasePath}.lock"));
    }

    [Fact]
    public void An_in_memory_database_needs_no_lock()
    {
        Assert.Null(DemoDataReset.Lock("Data Source=:memory:"));
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
