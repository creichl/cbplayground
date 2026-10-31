using Microsoft.Data.Sqlite;

namespace Cbplayground.Api.Data;

public static class SqliteConnectionStrings
{
    /// <summary>
    /// The connection string with a relative "Data Source" resolved against the content root, like "Uploads:Path" and
    /// "Backup:Path". SQLite itself would resolve it against the working directory, so the database would end up
    /// somewhere else when the API is started from another folder. In-memory databases are returned unchanged.
    /// </summary>
    public static string Resolve(string connectionString, string contentRootPath)
    {
        var builder = new SqliteConnectionStringBuilder(connectionString);
        if (builder.Mode == SqliteOpenMode.Memory || builder.DataSource is "" or ":memory:")
        {
            return connectionString;
        }

        builder.DataSource = Path.GetFullPath(Path.Combine(contentRootPath, builder.DataSource));
        return builder.ToString();
    }
}
