using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTableShapesAndTableScale : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Rotation",
                table: "Tables",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Shape",
                table: "Tables",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "Square");

            // Existing tables get the default shape for their seats (Table.DefaultShape): square up to 4, rectangular from 5.
            migrationBuilder.Sql("""UPDATE "Tables" SET "Shape" = 'Rectangle' WHERE "Seats" >= 5;""");

            migrationBuilder.AddColumn<int>(
                name: "TableScale",
                table: "Areas",
                type: "INTEGER",
                nullable: false,
                defaultValue: 100);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Rotation",
                table: "Tables");

            migrationBuilder.DropColumn(
                name: "Shape",
                table: "Tables");

            migrationBuilder.DropColumn(
                name: "TableScale",
                table: "Areas");
        }
    }
}
