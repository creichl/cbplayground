using Cbplayground.Api.OpeningHours;

namespace Cbplayground.Api.Tests;

public class HolidayProviderTests
{
    private readonly HolidayProvider provider = new();

    private List<(string Date, string Key)> HolidaysOf(string countryCode, string? regionCode, int year) =>
        provider.GetHolidays(countryCode, regionCode, new DateOnly(year, 1, 1), new DateOnly(year, 12, 31))
            .Select(h => (h.Date.ToString("yyyy-MM-dd"), h.Key))
            .ToList();

    [Fact]
    public void Bavaria_2026()
    {
        Assert.Equal(
        [
            ("2026-01-01", "newYear"),
            ("2026-01-06", "epiphany"),
            ("2026-04-03", "goodFriday"),
            ("2026-04-06", "easterMonday"),
            ("2026-05-01", "labourDay"),
            ("2026-05-14", "ascension"),
            ("2026-05-25", "whitMonday"),
            ("2026-06-04", "corpusChristi"),
            ("2026-08-15", "assumption"),
            ("2026-10-03", "germanUnity"),
            ("2026-11-01", "allSaints"),
            ("2026-12-25", "christmasDay"),
            ("2026-12-26", "secondChristmasDay"),
        ], HolidaysOf("DE", "DE-BY", 2026));
    }

    [Fact]
    public void Bavaria_2027()
    {
        Assert.Equal(
        [
            ("2027-01-01", "newYear"),
            ("2027-01-06", "epiphany"),
            ("2027-03-26", "goodFriday"),
            ("2027-03-29", "easterMonday"),
            ("2027-05-01", "labourDay"),
            ("2027-05-06", "ascension"),
            ("2027-05-17", "whitMonday"),
            ("2027-05-27", "corpusChristi"),
            ("2027-08-15", "assumption"),
            ("2027-10-03", "germanUnity"),
            ("2027-11-01", "allSaints"),
            ("2027-12-25", "christmasDay"),
            ("2027-12-26", "secondChristmasDay"),
        ], HolidaysOf("DE", "DE-BY", 2027));
    }

    [Theory]
    [InlineData(2026)]
    [InlineData(2027)]
    public void Berlin_has_international_womens_day_but_no_corpus_christi(int year)
    {
        var holidays = HolidaysOf("DE", "DE-BE", year);

        Assert.Contains(($"{year}-03-08", "womensDay"), holidays);
        Assert.DoesNotContain(holidays, h => h.Key is "corpusChristi" or "assumption" or "epiphany" or "allSaints");
        Assert.Equal(10, holidays.Count);
    }

    [Theory]
    [InlineData(2026, "2026-11-18")]
    [InlineData(2027, "2027-11-17")]
    public void Saxony_has_repentance_day_on_the_wednesday_before_23_november(int year, string date)
    {
        Assert.Contains((date, "repentanceDay"), HolidaysOf("DE", "DE-SN", year));
    }

    [Theory]
    [InlineData("DE-BW", 12)]
    [InlineData("DE-BY", 13)]
    [InlineData("DE-BE", 10)]
    [InlineData("DE-BB", 12)]
    [InlineData("DE-HB", 10)]
    [InlineData("DE-HH", 10)]
    [InlineData("DE-HE", 12)]
    [InlineData("DE-MV", 11)]
    [InlineData("DE-NI", 10)]
    [InlineData("DE-NW", 11)]
    [InlineData("DE-RP", 11)]
    [InlineData("DE-SL", 12)]
    [InlineData("DE-SN", 11)]
    [InlineData("DE-ST", 11)]
    [InlineData("DE-SH", 10)]
    [InlineData("DE-TH", 11)]
    public void Every_federal_state_has_its_number_of_holidays_in_2026(string state, int count)
    {
        Assert.Equal(count, HolidaysOf("DE", state, 2026).Count);
    }

    [Fact]
    public void State_specific_holidays_in_2026()
    {
        Assert.Contains(("2026-04-05", "easterSunday"), HolidaysOf("DE", "DE-BB", 2026));
        Assert.Contains(("2026-05-24", "whitSunday"), HolidaysOf("DE", "DE-HE", 2026));
        Assert.Contains(("2026-09-20", "childrensDay"), HolidaysOf("DE", "DE-TH", 2026));
        Assert.Contains(("2026-10-31", "reformationDay"), HolidaysOf("DE", "DE-NI", 2026));
        Assert.Contains(("2026-08-15", "assumption"), HolidaysOf("DE", "DE-SL", 2026));
        Assert.DoesNotContain(HolidaysOf("DE", "DE-NW", 2026), h => h.Key == "assumption");
    }

    [Fact]
    public void Austria_2026()
    {
        Assert.Equal(
        [
            ("2026-01-01", "newYear"),
            ("2026-01-06", "epiphany"),
            ("2026-04-06", "easterMonday"),
            ("2026-05-01", "stateHoliday"),
            ("2026-05-14", "ascension"),
            ("2026-05-25", "whitMonday"),
            ("2026-06-04", "corpusChristi"),
            ("2026-08-15", "assumption"),
            ("2026-10-26", "nationalDay"),
            ("2026-11-01", "allSaints"),
            ("2026-12-08", "immaculateConception"),
            ("2026-12-25", "christmasDay"),
            ("2026-12-26", "stStephensDay"),
        ], HolidaysOf("AT", null, 2026));
    }

    [Fact]
    public void Serbia_2026_with_orthodox_easter_on_12_april()
    {
        Assert.Equal(
        [
            ("2026-01-01", "newYear"),
            ("2026-01-02", "newYear2"),
            ("2026-01-07", "orthodoxChristmas"),
            ("2026-02-15", "statehoodDay"),
            ("2026-02-16", "statehoodDay2"),
            ("2026-04-10", "orthodoxGoodFriday"),
            ("2026-04-11", "orthodoxHolySaturday"),
            ("2026-04-12", "orthodoxEaster"),
            ("2026-04-13", "orthodoxEasterMonday"),
            ("2026-05-01", "labourDay"),
            ("2026-05-02", "labourDay2"),
            ("2026-11-11", "armisticeDay"),
        ], HolidaysOf("RS", null, 2026));
    }

    [Fact]
    public void Serbia_2027_with_orthodox_easter_on_2_may()
    {
        var holidays = HolidaysOf("RS", null, 2027);

        Assert.Contains(("2027-04-30", "orthodoxGoodFriday"), holidays);
        Assert.Contains(("2027-05-01", "orthodoxHolySaturday"), holidays);
        Assert.Contains(("2027-05-02", "orthodoxEaster"), holidays);
        Assert.Contains(("2027-05-03", "orthodoxEasterMonday"), holidays);
        // 1 and 2 May are also Labour Day: one entry per holiday, both on the same day.
        Assert.Contains(("2027-05-02", "labourDay2"), holidays);
    }

    [Theory]
    [InlineData(2025, "2025-04-20")]
    [InlineData(2028, "2028-04-16")]
    [InlineData(2029, "2029-04-08")]
    [InlineData(2030, "2030-04-28")]
    public void Orthodox_easter(int year, string date)
    {
        Assert.Contains((date, "orthodoxEaster"), HolidaysOf("RS", null, year));
    }

    [Fact]
    public void Only_holidays_in_the_range_are_returned_across_years()
    {
        var holidays = provider.GetHolidays("AT", null, new DateOnly(2026, 12, 20), new DateOnly(2027, 1, 6));

        Assert.Equal(
            [new DateOnly(2026, 12, 25), new DateOnly(2026, 12, 26), new DateOnly(2027, 1, 1), new DateOnly(2027, 1, 6)],
            holidays.Select(h => h.Date));
    }
}
