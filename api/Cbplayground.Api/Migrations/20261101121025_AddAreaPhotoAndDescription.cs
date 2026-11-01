using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAreaPhotoAndDescription : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Areas",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhotoFileName",
                table: "Areas",
                type: "TEXT",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Description",
                table: "Areas");

            migrationBuilder.DropColumn(
                name: "PhotoFileName",
                table: "Areas");
        }
    }
}
