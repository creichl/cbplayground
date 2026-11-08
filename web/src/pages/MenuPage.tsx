import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Drawer,
  FileButton,
  Group,
  Image,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.ts'
import {
  allergens,
  type Allergen,
  type Currency,
  marks,
  type MenuItem,
  type MenuItemInput,
  type MenuSection,
  menuErrorMessage,
  menuImageTypes,
  menuLimits,
  minorUnits,
  useAddItem,
  useAddSection,
  useDeleteItem,
  useDeleteItemPhoto,
  useDeleteSection,
  useMenu,
  useReorderItems,
  useReorderSections,
  useUpdateItem,
  useUpdateSection,
  useUploadItemPhoto,
} from '../api/menu.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { ChevronDownIcon, ChevronUpIcon, DotsVerticalIcon, PencilIcon, PhotoIcon, PlusIcon, TrashIcon } from '../components/icons.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { formatPrice } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'

/** The dialog of a section: a new one, or the one being renamed. */
type SectionEdit = { section: MenuSection | null }

/** The drawer of a dish: a new one in a section, or the one being edited. */
type ItemEdit = { sectionId: string; itemId: string | null }

/** The dish without its id and photo, as it is saved; `sectionId` another section to move it there. */
function toInput(item: MenuItem, sectionId = item.sectionId): MenuItemInput {
  return {
    sectionId,
    name: item.name,
    description: item.description,
    price: item.price,
    vegetarian: item.vegetarian,
    vegan: item.vegan,
    glutenFree: item.glutenFree,
    spicy: item.spicy,
    recommended: item.recommended,
    allergens: item.allergens,
  }
}

/**
 * The restaurant's menu: its sections as cards in their order, each with its dishes as rows (thumbnail, name, price,
 * marks). Sections are added, renamed, moved and deleted here; a dish opens a drawer with all its details and its photo.
 * Every change is saved at once, like the gallery and the closing days, with a toast; there is no save bar.
 */
export function MenuPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('menu.title'))
  const menu = useMenu()
  const reorderSections = useReorderSections()
  const [sectionEdit, setSectionEdit] = useState<SectionEdit | null>(null)
  const [deletingSection, setDeletingSection] = useState<MenuSection | null>(null)
  const [itemEdit, setItemEdit] = useState<ItemEdit | null>(null)

  const failed = (error: unknown) => notifications.show({ color: 'red', title: t('errors.title'), message: menuErrorMessage(error, t) })

  if (menu.isPending) {
    return (
      <Stack gap="lg">
        <PageHeader title={t('menu.title')} description={t('menu.description')} />
        <Skeleton h={200} radius="md" />
        <Skeleton h={200} radius="md" />
      </Stack>
    )
  }
  if (menu.isError) {
    return (
      <Stack gap="lg">
        <PageHeader title={t('menu.title')} description={t('menu.description')} />
        <ErrorAlert error={menu.error} onRetry={() => void menu.refetch()} />
      </Stack>
    )
  }

  const { sections, currency } = menu.data
  const full = sections.length >= menuLimits.sections

  function moveSection(index: number, direction: -1 | 1) {
    const order = sections.map((section) => section.id)
    const [id] = order.splice(index, 1)
    order.splice(index + direction, 0, id)
    reorderSections.mutate(order, {
      onSuccess: () => notifications.show({ color: 'green', message: t('menu.toast.orderSaved') }),
      onError: failed,
    })
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title={t('menu.title')}
        description={t('menu.description')}
        action={
          sections.length > 0 && (
            <Button leftSection={<PlusIcon />} disabled={full} onClick={() => setSectionEdit({ section: null })}>
              {t('menu.section.add')}
            </Button>
          )
        }
      />

      {sections.length === 0 ? (
        <Paper withBorder radius="md" p="xl">
          <Stack align="center" gap="sm" py="lg">
            <Title order={3}>{t('menu.empty.title')}</Title>
            <Text c="dimmed" ta="center" maw={520}>
              {t('menu.empty.text')}
            </Text>
            <Button leftSection={<PlusIcon />} onClick={() => setSectionEdit({ section: null })}>
              {t('menu.empty.action')}
            </Button>
          </Stack>
        </Paper>
      ) : (
        sections.map((section, index) => (
          <SectionCard
            key={section.id}
            section={section}
            sections={sections}
            currency={currency}
            first={index === 0}
            last={index === sections.length - 1}
            onMove={(direction) => moveSection(index, direction)}
            onEdit={() => setSectionEdit({ section })}
            onDelete={() => setDeletingSection(section)}
            onAddItem={() => setItemEdit({ sectionId: section.id, itemId: null })}
            onOpenItem={(item) => setItemEdit({ sectionId: section.id, itemId: item.id })}
          />
        ))
      )}
      {full && (
        <Text c="dimmed" size="sm">
          {t('menu.section.full', { max: menuLimits.sections })}
        </Text>
      )}

      {sectionEdit !== null && <SectionModal section={sectionEdit.section} onClose={() => setSectionEdit(null)} />}
      {deletingSection !== null && <DeleteSectionModal section={deletingSection} onClose={() => setDeletingSection(null)} />}
      {itemEdit !== null && (
        <ItemDrawer
          key={itemEdit.itemId ?? `new-${itemEdit.sectionId}`}
          item={sections.flatMap((s) => s.items).find((item) => item.id === itemEdit.itemId) ?? null}
          sectionId={itemEdit.sectionId}
          currency={currency}
          onClose={() => setItemEdit(null)}
          onCreated={(item) => setItemEdit({ sectionId: item.sectionId, itemId: item.id })}
        />
      )}
    </Stack>
  )
}

type SectionCardProps = {
  section: MenuSection
  sections: MenuSection[]
  currency: Currency
  first: boolean
  last: boolean
  onMove: (direction: -1 | 1) => void
  onEdit: () => void
  onDelete: () => void
  onAddItem: () => void
  onOpenItem: (item: MenuItem) => void
}

/** A section with its name and description, its buttons, and its dishes as rows in their order. */
function SectionCard({ section, sections, currency, first, last, onMove, onEdit, onDelete, onAddItem, onOpenItem }: SectionCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const reorderItems = useReorderItems()
  const updateItem = useUpdateItem()

  const failed = (error: unknown) => notifications.show({ color: 'red', title: t('errors.title'), message: menuErrorMessage(error, t) })

  function moveItem(index: number, direction: -1 | 1) {
    const order = section.items.map((item) => item.id)
    const [id] = order.splice(index, 1)
    order.splice(index + direction, 0, id)
    reorderItems.mutate(
      { sectionId: section.id, itemIds: order },
      { onSuccess: () => notifications.show({ color: 'green', message: t('menu.toast.orderSaved') }), onError: failed },
    )
  }

  function moveToSection(item: MenuItem, target: MenuSection) {
    updateItem.mutate(
      { id: item.id, item: toInput(item, target.id) },
      { onSuccess: () => notifications.show({ color: 'green', message: t('menu.toast.itemMoved', { name: item.name, section: target.name }) }), onError: failed },
    )
  }

  return (
    <Card withBorder radius="md" padding="lg" data-menu-section={section.name}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Stack gap={2} miw={0}>
            <Title order={3}>{section.name}</Title>
            {section.description !== null && (
              <Text c="dimmed" size="sm">
                {section.description}
              </Text>
            )}
          </Stack>
          <Group gap={4} wrap="nowrap">
            <Tooltip label={t('menu.section.moveUp')}>
              <ActionIcon variant="subtle" color="gray" aria-label={t('menu.section.moveUp')} disabled={first} onClick={() => onMove(-1)}>
                <ChevronUpIcon />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('menu.section.moveDown')}>
              <ActionIcon variant="subtle" color="gray" aria-label={t('menu.section.moveDown')} disabled={last} onClick={() => onMove(1)}>
                <ChevronDownIcon />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('menu.section.edit')}>
              <ActionIcon variant="subtle" color="gray" aria-label={t('menu.section.edit')} onClick={onEdit}>
                <PencilIcon />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('menu.section.delete')}>
              <ActionIcon variant="subtle" color="red" aria-label={t('menu.section.delete')} onClick={onDelete}>
                <TrashIcon />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {section.items.length === 0 ? (
          <Text c="dimmed" size="sm">
            {t('menu.section.noItems')}
          </Text>
        ) : (
          <Stack gap={0} component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
            {section.items.map((item, index) => (
              <Box
                component="li"
                key={item.id}
                py="xs"
                style={{ borderTop: index === 0 ? undefined : '1px solid var(--mantine-color-default-border)' }}
              >
                <Group wrap="nowrap" gap="sm">
                  <UnstyledButton onClick={() => onOpenItem(item)} style={{ flex: 1, minWidth: 0 }} aria-label={t('menu.item.open', { name: item.name })}>
                    <Group wrap="nowrap" gap="sm">
                      <Thumbnail url={item.photoUrl} size={48} />
                      <Stack gap={2} miw={0} style={{ flex: 1 }}>
                        <Text fw={600} truncate>
                          {item.name}
                        </Text>
                        <ItemMarks item={item} />
                      </Stack>
                      <Text fw={600} style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {item.price === null ? '' : formatPrice(item.price, currency, language)}
                      </Text>
                    </Group>
                  </UnstyledButton>
                  <Group gap={2} wrap="nowrap">
                    <Tooltip label={t('menu.item.moveUp')}>
                      <ActionIcon variant="subtle" color="gray" aria-label={t('menu.item.moveUp')} disabled={index === 0} onClick={() => moveItem(index, -1)}>
                        <ChevronUpIcon />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t('menu.item.moveDown')}>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={t('menu.item.moveDown')}
                        disabled={index === section.items.length - 1}
                        onClick={() => moveItem(index, 1)}
                      >
                        <ChevronDownIcon />
                      </ActionIcon>
                    </Tooltip>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label={t('menu.item.moveToSection')} disabled={sections.length < 2}>
                          <DotsVerticalIcon />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Label>{t('menu.item.moveToSection')}</Menu.Label>
                        {sections
                          .filter((s) => s.id !== section.id)
                          .map((target) => (
                            <Menu.Item key={target.id} onClick={() => moveToSection(item, target)}>
                              {target.name}
                            </Menu.Item>
                          ))}
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
              </Box>
            ))}
          </Stack>
        )}

        <Group>
          <Button variant="light" leftSection={<PlusIcon />} onClick={onAddItem}>
            {t('menu.item.add')}
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

/** The marks of a dish as small badges: recommended, vegetarian, vegan, gluten-free, spicy. */
function ItemMarks({ item }: { item: MenuItem }) {
  const { t } = useTranslation()
  const shown = marks.filter((mark) => item[mark])
  if (!item.recommended && shown.length === 0) {
    return null
  }
  return (
    <Group gap={4}>
      {item.recommended && (
        <Badge size="xs" variant="filled">
          {t('menu.marks.recommended')}
        </Badge>
      )}
      {shown.map((mark) => (
        <Badge key={mark} size="xs" variant="light" color={mark === 'spicy' ? 'red' : 'green'}>
          {t(`menu.marks.${mark}`)}
        </Badge>
      ))}
    </Group>
  )
}

/** A square thumbnail of the dish's photo, or a calm surface with a photo icon without one. */
function Thumbnail({ url, size }: { url: string | null; size: number }) {
  return url !== null ? (
    <Image src={url} alt="" w={size} h={size} radius="sm" fit="cover" style={{ flexShrink: 0 }} loading="lazy" />
  ) : (
    <Box
      w={size}
      h={size}
      bg="var(--mantine-color-default-hover)"
      c="dimmed"
      style={{ flexShrink: 0, borderRadius: 'var(--mantine-radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <PhotoIcon />
    </Box>
  )
}

/** Adds a section, or renames one and changes its description; saved with the button. */
function SectionModal({ section, onClose }: { section: MenuSection | null; onClose: () => void }) {
  const { t } = useTranslation()
  const add = useAddSection()
  const update = useUpdateSection()
  const [name, setName] = useState(section?.name ?? '')
  const [description, setDescription] = useState(section?.description ?? '')
  const [error, setError] = useState<{ field: 'name' | 'description'; message: string } | null>(null)
  const pending = add.isPending || update.isPending

  function submit(event: FormEvent) {
    event.preventDefault()
    if (name.trim() === '') {
      setError({ field: 'name', message: t('menu.errors.invalidName') })
      return
    }
    const input = { name: name.trim(), description: description.trim() === '' ? null : description.trim() }
    const options = {
      onSuccess: () => {
        notifications.show({ color: 'green', message: t(section === null ? 'menu.toast.sectionAdded' : 'menu.toast.sectionSaved') })
        onClose()
      },
      onError: (failure: unknown) => {
        const message = menuErrorMessage(failure, t)
        if (failure instanceof ApiError && (failure.code === 'invalid_name' || failure.code === 'invalid_description')) {
          setError({ field: failure.code === 'invalid_name' ? 'name' : 'description', message })
        } else {
          notifications.show({ color: 'red', title: t('errors.title'), message })
        }
      },
    }
    if (section === null) {
      add.mutate(input, options)
    } else {
      update.mutate({ id: section.id, ...input }, options)
    }
  }

  return (
    <Modal opened onClose={onClose} title={t(section === null ? 'menu.section.addTitle' : 'menu.section.editTitle')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label={t('menu.section.name')}
            placeholder={t('menu.section.namePlaceholder')}
            required
            data-autofocus
            maxLength={menuLimits.sectionName}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={error?.field === 'name' ? error.message : undefined}
          />
          <Textarea
            label={t('menu.section.descriptionLabel')}
            placeholder={t('menu.section.descriptionPlaceholder')}
            autosize
            minRows={2}
            maxLength={menuLimits.sectionDescription}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            error={error?.field === 'description' ? error.message : undefined}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {t(section === null ? 'menu.section.addConfirm' : 'menu.section.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

/** Asks before deleting a section, and says how many dishes go with it. */
function DeleteSectionModal({ section, onClose }: { section: MenuSection; onClose: () => void }) {
  const { t } = useTranslation()
  const deleteSection = useDeleteSection()

  return (
    <Modal opened onClose={onClose} title={t('menu.section.deleteTitle')}>
      <Stack gap="md">
        <Text size="sm">
          {section.items.length === 0
            ? t('menu.section.deleteEmpty', { name: section.name })
            : t('menu.section.deleteText', { name: section.name, count: section.items.length })}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            color="red"
            loading={deleteSection.isPending}
            onClick={() =>
              deleteSection.mutate(section.id, {
                onSuccess: () => {
                  notifications.show({ color: 'green', message: t('menu.toast.sectionDeleted', { name: section.name }) })
                  onClose()
                },
                onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: menuErrorMessage(error, t) }),
              })
            }
          >
            {t('menu.section.deleteConfirm')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

type ItemDrawerProps = {
  /** The dish being edited; null for a new one in `sectionId`. */
  item: MenuItem | null
  sectionId: string
  currency: Currency
  onClose: () => void
  /** A new dish was saved; the drawer goes on with it, e.g. for its photo. */
  onCreated: (item: MenuItem) => void
}

type ItemErrors = Partial<Record<'name' | 'description' | 'price', string>>

/**
 * A dish in a drawer: name, description, price in the currency (empty for no price), the marks as checkboxes, the
 * allergens as chips, and its photo. The fields are saved with "Save"; the photo of a saved dish is uploaded, replaced or
 * removed at once. A photo chosen for a new dish is uploaded right after the dish is saved.
 */
function ItemDrawer({ item, sectionId, currency, onClose, onCreated }: ItemDrawerProps) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const add = useAddItem()
  const update = useUpdateItem()
  const deleteItem = useDeleteItem()
  const uploadPhoto = useUploadItemPhoto()
  const deletePhoto = useDeleteItemPhoto()
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [price, setPrice] = useState<string | number>(item?.price === null || item === null ? '' : item.price / minorUnits)
  const [flags, setFlags] = useState({
    vegetarian: item?.vegetarian ?? false,
    vegan: item?.vegan ?? false,
    glutenFree: item?.glutenFree ?? false,
    spicy: item?.spicy ?? false,
    recommended: item?.recommended ?? false,
  })
  const [chosenAllergens, setChosenAllergens] = useState<string[]>(item?.allergens ?? [])
  const [errors, setErrors] = useState<ItemErrors>({})
  // A photo chosen for a dish that is not saved yet, with its preview.
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; url: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => () => {
    if (pendingPhoto !== null) {
      URL.revokeObjectURL(pendingPhoto.url)
    }
  }, [pendingPhoto])

  const failed = (error: unknown) => notifications.show({ color: 'red', title: t('errors.title'), message: menuErrorMessage(error, t) })

  /** The photo is checked here first, so a wrong file is not sent at all. */
  function photoProblem(file: File) {
    return !menuImageTypes.includes(file.type) ? 'floor_plan_type_invalid' : file.size > menuLimits.photoBytes ? 'floor_plan_too_large' : null
  }

  function choosePhoto(file: File | null) {
    if (file === null) {
      return
    }
    const problem = photoProblem(file)
    if (problem !== null) {
      failed(problem)
      return
    }
    if (item === null) {
      setPendingPhoto({ file, url: URL.createObjectURL(file) })
      return
    }
    uploadPhoto.mutate(
      { id: item.id, file },
      { onSuccess: () => notifications.show({ color: 'green', message: t('menu.toast.photoSaved') }), onError: failed },
    )
  }

  function removePhoto() {
    if (item === null) {
      setPendingPhoto(null)
      return
    }
    deletePhoto.mutate(item.id, { onSuccess: () => notifications.show({ color: 'green', message: t('menu.toast.photoRemoved') }), onError: failed })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const priceValue = typeof price === 'number' ? price : price.trim() === '' ? null : Number(price.replace(',', '.'))
    const minor = priceValue === null ? null : Math.round(priceValue * minorUnits)
    const found: ItemErrors = {}
    if (name.trim() === '') {
      found.name = t('menu.errors.invalidName')
    }
    if (minor !== null && (Number.isNaN(minor) || minor < 0 || minor > menuLimits.price)) {
      found.price = t('menu.errors.invalidPrice')
    }
    setErrors(found)
    if (Object.keys(found).length > 0) {
      return
    }

    const input: MenuItemInput = {
      sectionId: item?.sectionId ?? sectionId,
      name: name.trim(),
      description: description.trim() === '' ? null : description.trim(),
      price: minor,
      ...flags,
      allergens: allergens.filter((allergen) => chosenAllergens.includes(allergen)),
    }
    const onError = (failure: unknown) => {
      const message = menuErrorMessage(failure, t)
      const field = failure instanceof ApiError ? { invalid_name: 'name', invalid_description: 'description', invalid_price: 'price' }[failure.code ?? ''] : undefined
      if (field !== undefined) {
        setErrors({ [field]: message })
      } else {
        failed(failure)
      }
    }

    if (item !== null) {
      update.mutate(
        { id: item.id, item: input },
        {
          onSuccess: () => {
            notifications.show({ color: 'green', message: t('menu.toast.itemSaved', { name: input.name }) })
            onClose()
          },
          onError,
        },
      )
      return
    }
    add.mutate(input, {
      onSuccess: (created) => {
        notifications.show({ color: 'green', message: t('menu.toast.itemAdded', { name: created.name }) })
        if (pendingPhoto === null) {
          onClose()
          return
        }
        uploadPhoto.mutate(
          { id: created.id, file: pendingPhoto.file },
          {
            onSuccess: onClose,
            // The dish is saved; the drawer stays open with it, so the photo can be chosen again.
            onError: (error) => {
              failed(error)
              onCreated(created)
            },
          },
        )
      },
      onError,
    })
  }

  const photoUrl = pendingPhoto?.url ?? item?.photoUrl ?? null

  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size={isMobile ? '100%' : 'md'}
      title={
        <Text fw={650} size="lg">
          {t(item === null ? 'menu.item.addTitle' : 'menu.item.editTitle')}
        </Text>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label={t('menu.item.name')}
            placeholder={t('menu.item.namePlaceholder')}
            required
            data-autofocus
            maxLength={menuLimits.itemName}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={errors.name}
          />
          <Textarea
            label={t('menu.item.description')}
            placeholder={t('menu.item.descriptionPlaceholder')}
            autosize
            minRows={2}
            maxLength={menuLimits.itemDescription}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            error={errors.description}
          />
          <NumberInput
            label={t('menu.item.price', { currency })}
            description={t('menu.item.priceHint')}
            min={0}
            max={menuLimits.price / minorUnits}
            decimalScale={2}
            allowNegative={false}
            hideControls
            maw={220}
            value={price}
            onChange={setPrice}
            error={errors.price}
          />

          <Stack gap={6}>
            <Text size="sm" fw={500}>
              {t('menu.item.marks')}
            </Text>
            <Checkbox
              label={t('menu.marks.recommendedLong')}
              checked={flags.recommended}
              onChange={(event) => setFlags({ ...flags, recommended: event.currentTarget.checked })}
            />
            {marks.map((mark) => (
              <Checkbox
                key={mark}
                label={t(`menu.marks.${mark}`)}
                checked={flags[mark]}
                onChange={(event) => setFlags({ ...flags, [mark]: event.currentTarget.checked })}
              />
            ))}
          </Stack>

          <Stack gap={6}>
            <Text size="sm" fw={500} id="menu-item-allergens">
              {t('menu.item.allergens')}
            </Text>
            <Chip.Group multiple value={chosenAllergens} onChange={setChosenAllergens}>
              <Group gap={6} role="group" aria-labelledby="menu-item-allergens">
                {allergens.map((allergen: Allergen) => (
                  <Chip key={allergen} value={allergen} size="sm">
                    {t(`menu.allergens.${allergen}`)}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </Stack>

          <Stack gap={6}>
            <Text size="sm" fw={500}>
              {t('menu.item.photo')}
            </Text>
            {photoUrl !== null ? (
              <Image src={photoUrl} alt={t('menu.item.photoAlt', { name: name.trim() || item?.name || '' })} h={180} radius="sm" fit="cover" />
            ) : (
              <Text c="dimmed" size="sm">
                {t('menu.item.noPhoto')}
              </Text>
            )}
            <Group gap="sm">
              <FileButton onChange={choosePhoto} accept={menuImageTypes.join(',')}>
                {(props) => (
                  <Button {...props} size="xs" variant={photoUrl === null ? 'light' : 'default'} loading={uploadPhoto.isPending}>
                    {photoUrl === null ? t('menu.item.choosePhoto') : t('menu.item.replacePhoto')}
                  </Button>
                )}
              </FileButton>
              {photoUrl !== null && (
                <Button size="xs" variant="subtle" color="red" onClick={removePhoto} loading={deletePhoto.isPending}>
                  {t('menu.item.removePhoto')}
                </Button>
              )}
            </Group>
            <Text c="dimmed" size="xs">
              {t('menu.item.photoHint')}
            </Text>
          </Stack>

          <Group justify="space-between" mt="sm">
            {item !== null ? (
              <Button variant="subtle" color="red" leftSection={<TrashIcon />} onClick={() => setConfirmDelete(true)}>
                {t('menu.item.delete')}
              </Button>
            ) : (
              <span />
            )}
            <Group gap="sm">
              <Button variant="default" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={add.isPending || update.isPending}>
                {t('menu.item.save')}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>

      <Modal opened={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('menu.item.deleteTitle')}>
        <Stack gap="md">
          <Text size="sm">{t('menu.item.deleteText', { name: item?.name ?? '' })}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              loading={deleteItem.isPending}
              onClick={() =>
                item !== null &&
                deleteItem.mutate(item.id, {
                  onSuccess: () => {
                    notifications.show({ color: 'green', message: t('menu.toast.itemDeleted', { name: item.name }) })
                    onClose()
                  },
                  onError: failed,
                })
              }
            >
              {t('menu.item.deleteConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Drawer>
  )
}
