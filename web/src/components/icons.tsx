import type { ReactNode, SVGProps } from 'react'

// Small line icons instead of typographic symbols. They are decorative: the button or text around them carries the label.

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number }

function Icon({ size = 18, children, ...others }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...others}
    >
      {children}
    </svg>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 6l-6 6l6 6" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6l-6 6" />
    </Icon>
  )
}

export function DotsVerticalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </Icon>
  )
}

export function NoteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12l5 5l10 -10" />
    </Icon>
  )
}

export function XIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6l-12 12M6 6l12 12" />
    </Icon>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </Icon>
  )
}

export function BanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.7 5.7l12.6 12.6" />
    </Icon>
  )
}

export function DoorExitIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 8v-2a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2 -2v-2" />
      <path d="M9 12h12l-3 -3M18 15l3 -3" />
    </Icon>
  )
}

export function UndoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 14l-4 -4l4 -4" />
      <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
    </Icon>
  )
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
      <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  )
}

export function ZoomResetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8v-2a2 2 0 0 1 2 -2h2M4 16v2a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v2M16 20h2a2 2 0 0 0 2 -2v-2" />
    </Icon>
  )
}
