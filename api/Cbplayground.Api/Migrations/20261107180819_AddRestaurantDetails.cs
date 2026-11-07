using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRestaurantDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Cuisines",
                table: "Tenants",
                type: "TEXT",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "Features",
                table: "Tenants",
                type: "TEXT",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "HouseRules",
                table: "Tenants",
                type: "TEXT",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PriceLevel",
                table: "Tenants",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "RestaurantFaqs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TenantId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Question = table.Column<string>(type: "TEXT", maxLength: 150, nullable: false),
                    Answer = table.Column<string>(type: "TEXT", maxLength: 600, nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RestaurantFaqs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RestaurantFaqs_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantFaqs_TenantId_SortOrder",
                table: "RestaurantFaqs",
                columns: new[] { "TenantId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RestaurantFaqs");

            migrationBuilder.DropColumn(
                name: "Cuisines",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "Features",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "HouseRules",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "PriceLevel",
                table: "Tenants");
        }
    }
}
