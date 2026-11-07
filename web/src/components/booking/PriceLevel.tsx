import { useTranslation } from 'react-i18next'
import { type PriceLevel as Level, priceLevels } from '../../api/restaurantDetails.ts'

/**
 * The price level as € for every level, the ones above the restaurant's faded, e.g. €€ and two faded € for level 2. Screen
 * readers hear its name instead, e.g. "Price level 2 of 4".
 */
export function PriceLevel({ level }: { level: Level }) {
  const { t } = useTranslation()

  return (
    <span role="img" aria-label={t('restaurantDetails.priceLevel', { level })} className="whitespace-nowrap tabular-nums">
      {priceLevels.map((step) => (
        <span key={step} aria-hidden="true" className={step > level ? 'opacity-40' : undefined}>
          €
        </span>
      ))}
    </span>
  )
}
