using Cbplayground.Api.Data;

namespace Cbplayground.Api.Tests;

public class SqliteConnectionStringsTests
{
    private static readonly string ContentRoot = Path.Combine(Path.GetTempPath(), "cbplayground-content-root");

    [Fact]
    public void A_relative_data_source_is_resolved_against_the_content_root()
    {
        Assert.Equal($"Data Source={Path.Combine(ContentRoot, "data", "cbplayground.db")}",
            SqliteConnectionStrings.Resolve("Data Source=data/cbplayground.db", ContentRoot));
    }

    [Theory]
    [InlineData("Data Source=:memory:")]
    [InlineData("Data Source=shared;Mode=Memory")]
    public void In_memory_databases_stay_as_they_are(string connectionString)
    {
        Assert.Equal(connectionString, SqliteConnectionStrings.Resolve(connectionString, ContentRoot));
    }

    [Fact]
    public void An_absolute_data_source_stays_where_it_is()
    {
        var absolute = Path.Combine(Path.GetTempPath(), "elsewhere", "cbplayground.db");

        Assert.Equal($"Data Source={absolute}", SqliteConnectionStrings.Resolve($"Data Source={absolute}", ContentRoot));
    }
}
