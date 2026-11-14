import type { Parentage } from '@extantape/onepedigree-core'

/** The contract agreed with the platform (docs/architecture/studbook.md). */
export type DatePrecision = 'exact' | 'day' | 'month' | 'year' | 'range' | 'unknown'
/** A midpoint date and how precisely it is known. Analysis treats estimates as exact (studbook practice). */
export type StudbookDate = { date: string | null; precision: DatePrecision; plusMinusDays?: number }
export type StudbookSex = 'female' | 'male' | 'unknown' | 'abnormal' | 'hermaphrodite'
export type BirthType = 'wild' | 'captive' | 'unknown'

export type StudbookAnimal = {
  id: string
  studbookNumber: string
  oldNumbers?: string[]
  coId: string
  animalId?: string
  sex: StudbookSex
  birthType: BirthType
  birth: StudbookDate
  parentage: Parentage | null
  status: 'alive' | 'dead' | 'lost-to-follow-up'
  selected?: boolean
  /** Counted in every analysis, shown only as a placeholder. */
  private?: boolean
}

export type StudbookEventType = 'birth' | 'capture' | 'transfer' | 'release' | 'recapture' | 'death' | 'lost-to-follow-up' | 'return-from-ltf'
export type StudbookEvent = {
  animal: string
  type: StudbookEventType
  date: StudbookDate
  /** Opaque holder code, never a name. */
  location: string
  owner?: string
  localId?: string
  cause?: string
  notes?: string
  sourceId?: string
}

export type CensusYear = { year: number; total: number; male: number; female: number; unknown: number; wildBorn: number; captiveBorn: number; originUnknown: number }

export type Studbook = { title: string; currentness: string; animals: StudbookAnimal[]; events: StudbookEvent[]; census?: CensusYear[] }
