namespace Cbplayground.Api.OpeningHours;

/// <summary>
/// Rule-based public holidays for Germany (by federal state), Austria and Serbia, without any external data.
/// The rules follow the holiday laws in force in 2026 and are applied to every year; earlier changes
/// (e.g. one-off holidays or holidays introduced later) are not modelled.
/// Holidays that only apply in some municipalities of a state (e.g. Augsburger Friedensfest, Corpus Christi
/// in parts of Saxony and Thuringia) are not included; see the README.
/// </summary>
public class HolidayProvider : IHolidayProvider
{
    public IReadOnlyList<Holiday> GetHolidays(string countryCode, string? regionCode, DateOnly from, DateOnly to)
    {
        var holidays = new List<Holiday>();
        for (var year = from.Year; year <= to.Year; year++)
        {
            var ofYear = countryCode switch
            {
                Locations.Germany => Germany(regionCode, year),
                Locations.Austria => Austria(year),
                Locations.Serbia => Serbia(year),
                _ => throw new ArgumentException($"Unsupported country '{countryCode}'.", nameof(countryCode)),
            };
            holidays.AddRange(ofYear.Where(h => h.Date >= from && h.Date <= to));
        }
        return holidays.OrderBy(h => h.Date).ToList();
    }

    private static IEnumerable<Holiday> Germany(string? state, int year)
    {
        var easter = WesternEaster(year);

        yield return new(new DateOnly(year, 1, 1), "newYear");
        if (state is "DE-BW" or "DE-BY" or "DE-ST")
        {
            yield return new(new DateOnly(year, 1, 6), "epiphany");
        }
        if (state is "DE-BE" or "DE-MV")
        {
            yield return new(new DateOnly(year, 3, 8), "womensDay");
        }
        yield return new(easter.AddDays(-2), "goodFriday");
        if (state is "DE-BB" or "DE-HE")
        {
            yield return new(easter, "easterSunday");
        }
        yield return new(easter.AddDays(1), "easterMonday");
        yield return new(new DateOnly(year, 5, 1), "labourDay");
        yield return new(easter.AddDays(39), "ascension");
        if (state is "DE-BB" or "DE-HE")
        {
            yield return new(easter.AddDays(49), "whitSunday");
        }
        yield return new(easter.AddDays(50), "whitMonday");
        if (state is "DE-BW" or "DE-BY" or "DE-HE" or "DE-NW" or "DE-RP" or "DE-SL")
        {
            yield return new(easter.AddDays(60), "corpusChristi");
        }
        // In Bavaria only in municipalities with a predominantly Catholic population (most of them).
        if (state is "DE-BY" or "DE-SL")
        {
            yield return new(new DateOnly(year, 8, 15), "assumption");
        }
        if (state is "DE-TH")
        {
            yield return new(new DateOnly(year, 9, 20), "childrensDay");
        }
        yield return new(new DateOnly(year, 10, 3), "germanUnity");
        if (state is "DE-BB" or "DE-HB" or "DE-HH" or "DE-MV" or "DE-NI" or "DE-SN" or "DE-ST" or "DE-SH" or "DE-TH")
        {
            yield return new(new DateOnly(year, 10, 31), "reformationDay");
        }
        if (state is "DE-BW" or "DE-BY" or "DE-NW" or "DE-RP" or "DE-SL")
        {
            yield return new(new DateOnly(year, 11, 1), "allSaints");
        }
        if (state is "DE-SN")
        {
            // Buß- und Bettag: the Wednesday before 23 November.
            var repentanceDay = new DateOnly(year, 11, 22);
            while (repentanceDay.DayOfWeek != DayOfWeek.Wednesday)
            {
                repentanceDay = repentanceDay.AddDays(-1);
            }
            yield return new(repentanceDay, "repentanceDay");
        }
        yield return new(new DateOnly(year, 12, 25), "christmasDay");
        yield return new(new DateOnly(year, 12, 26), "secondChristmasDay");
    }

    private static IEnumerable<Holiday> Austria(int year)
    {
        var easter = WesternEaster(year);

        yield return new(new DateOnly(year, 1, 1), "newYear");
        yield return new(new DateOnly(year, 1, 6), "epiphany");
        yield return new(easter.AddDays(1), "easterMonday");
        yield return new(new DateOnly(year, 5, 1), "stateHoliday");
        yield return new(easter.AddDays(39), "ascension");
        yield return new(easter.AddDays(50), "whitMonday");
        yield return new(easter.AddDays(60), "corpusChristi");
        yield return new(new DateOnly(year, 8, 15), "assumption");
        yield return new(new DateOnly(year, 10, 26), "nationalDay");
        yield return new(new DateOnly(year, 11, 1), "allSaints");
        yield return new(new DateOnly(year, 12, 8), "immaculateConception");
        yield return new(new DateOnly(year, 12, 25), "christmasDay");
        yield return new(new DateOnly(year, 12, 26), "stStephensDay");
    }

    /// <summary>The non-working state and religious holidays of the Serbian holiday law that apply to everyone.</summary>
    private static IEnumerable<Holiday> Serbia(int year)
    {
        var easter = OrthodoxEaster(year);

        yield return new(new DateOnly(year, 1, 1), "newYear");
        yield return new(new DateOnly(year, 1, 2), "newYear2");
        yield return new(new DateOnly(year, 1, 7), "orthodoxChristmas");
        yield return new(new DateOnly(year, 2, 15), "statehoodDay");
        yield return new(new DateOnly(year, 2, 16), "statehoodDay2");
        yield return new(easter.AddDays(-2), "orthodoxGoodFriday");
        yield return new(easter.AddDays(-1), "orthodoxHolySaturday");
        yield return new(easter, "orthodoxEaster");
        yield return new(easter.AddDays(1), "orthodoxEasterMonday");
        yield return new(new DateOnly(year, 5, 1), "labourDay");
        yield return new(new DateOnly(year, 5, 2), "labourDay2");
        yield return new(new DateOnly(year, 11, 11), "armisticeDay");
    }

    /// <summary>Easter Sunday in the Gregorian calendar (anonymous Gregorian algorithm).</summary>
    private static DateOnly WesternEaster(int year)
    {
        var a = year % 19;
        var b = year / 100;
        var c = year % 100;
        var d = b / 4;
        var e = b % 4;
        var f = (b + 8) / 25;
        var g = (b - f + 1) / 3;
        var h = (19 * a + b - d - g + 15) % 30;
        var i = c / 4;
        var k = c % 4;
        var l = (32 + 2 * e + 2 * i - h - k) % 7;
        var m = (a + 11 * h + 22 * l) / 451;
        var month = (h + l - 7 * m + 114) / 31;
        var day = (h + l - 7 * m + 114) % 31 + 1;
        return new DateOnly(year, month, day);
    }

    /// <summary>Orthodox Easter Sunday: calculated in the Julian calendar (Meeus) and converted to the Gregorian calendar.</summary>
    private static DateOnly OrthodoxEaster(int year)
    {
        var a = year % 4;
        var b = year % 7;
        var c = year % 19;
        var d = (19 * c + 15) % 30;
        var e = (2 * a + 4 * b - d + 34) % 7;
        var month = (d + e + 114) / 31;
        var day = (d + e + 114) % 31 + 1;

        // Days the Julian calendar is behind the Gregorian one (13 from March 1900 to February 2100).
        var julianOffset = year / 100 - year / 400 - 2;
        return new DateOnly(year, month, day).AddDays(julianOffset);
    }
}
