using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTableStyleAndAreaWidth : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TableStyle",
                table: "Tenants",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "WidthMeters",
                table: "Areas",
                type: "REAL",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TableStyle",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "WidthMeters",
                table: "Areas");
        }
    }
}
