using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTableMinGuests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MinGuests",
                table: "Tables",
                type: "INTEGER",
                nullable: false,
                // Existing tables take every party that fits, as before.
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MinGuests",
                table: "Tables");
        }
    }
}
