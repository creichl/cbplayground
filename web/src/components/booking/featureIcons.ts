import {
  AccessibilityIcon,
  BabyIcon,
  Building2Icon,
  CreditCardIcon,
  DogIcon,
  DoorClosedIcon,
  type LucideIcon,
  MountainIcon,
  MusicIcon,
  ParasolIcon,
  SaladIcon,
  SquareParkingIcon,
  TreesIcon,
  VeganIcon,
  WheatOffIcon,
  WifiIcon,
} from 'lucide-react'
import type { RestaurantFeature } from '../../api/restaurantDetails.ts'

/** The icon of each feature, on the booking page and in the admin's chips. */
export const featureIcons: Record<RestaurantFeature, LucideIcon> = {
  Terrace: ParasolIcon,
  Garden: TreesIcon,
  Rooftop: Building2Icon,
  View: MountainIcon,
  WheelchairAccessible: AccessibilityIcon,
  DogsWelcome: DogIcon,
  ChildFriendly: BabyIcon,
  VegetarianOptions: SaladIcon,
  VeganOptions: VeganIcon,
  GlutenFreeOptions: WheatOffIcon,
  LiveMusic: MusicIcon,
  PrivateDining: DoorClosedIcon,
  Parking: SquareParkingIcon,
  CardPayment: CreditCardIcon,
  Wifi: WifiIcon,
}
