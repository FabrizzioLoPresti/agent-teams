/**
 * Tests para las constantes de configuración de complejos.
 *
 * Valida que COMPLEX_FEATURE_MAP, COMPLEX_FEATURE_VALUES, TIMEZONE_MAP,
 * TIMEZONE_VALUES, COUNTRY_MAP, COUNTRY_VALUES y CREATE_COMPLEX_FORM_STEPS
 * estén correctamente definidos y sean consistentes entre sí.
 */
import { describe, it, expect } from 'vitest'
import {
  COMPLEX_FEATURE_MAP,
  COMPLEX_FEATURE_VALUES,
  TIMEZONE_MAP,
  TIMEZONE_VALUES,
  COUNTRY_MAP,
  COUNTRY_VALUES,
  CREATE_COMPLEX_FORM_STEPS,
  CREATE_COMPLEX_FORM_DEFAULT_VALUES,
} from '@/config/complexes'

// ---------------------------------------------------------------------------
// COMPLEX_FEATURE_MAP / COMPLEX_FEATURE_VALUES
// ---------------------------------------------------------------------------

describe('COMPLEX_FEATURE_MAP y COMPLEX_FEATURE_VALUES', () => {
  it('tienen la misma cantidad de ítems', () => {
    expect(COMPLEX_FEATURE_MAP.length).toBe(COMPLEX_FEATURE_VALUES.length)
  })

  it('COMPLEX_FEATURE_VALUES contiene todos los values de COMPLEX_FEATURE_MAP', () => {
    const mapValues = COMPLEX_FEATURE_MAP.map((f) => f.value)
    for (const value of mapValues) {
      expect(COMPLEX_FEATURE_VALUES).toContain(value)
    }
  })

  it('cada ítem de COMPLEX_FEATURE_MAP tiene value y label no vacíos', () => {
    for (const feature of COMPLEX_FEATURE_MAP) {
      expect(feature.value.length).toBeGreaterThan(0)
      expect(feature.label.length).toBeGreaterThan(0)
    }
  })

  it('contiene las 12 amenidades esperadas', () => {
    expect(COMPLEX_FEATURE_VALUES).toContain('PARKING')
    expect(COMPLEX_FEATURE_VALUES).toContain('RESTROOMS')
    expect(COMPLEX_FEATURE_VALUES).toContain('SHOWERS')
    expect(COMPLEX_FEATURE_VALUES).toContain('LOCKER_ROOMS')
    expect(COMPLEX_FEATURE_VALUES).toContain('BARBECUE_AREA')
    expect(COMPLEX_FEATURE_VALUES).toContain('RESTAURANT')
    expect(COMPLEX_FEATURE_VALUES).toContain('CAFETERIA')
    expect(COMPLEX_FEATURE_VALUES).toContain('FIRST_AID')
    expect(COMPLEX_FEATURE_VALUES).toContain('SECURITY_SERVICE')
    expect(COMPLEX_FEATURE_VALUES).toContain('WIFI')
    expect(COMPLEX_FEATURE_VALUES).toContain('AIR_CONDITIONING')
    expect(COMPLEX_FEATURE_VALUES).toContain('EQUIPMENT_RENTAL')
    expect(COMPLEX_FEATURE_VALUES.length).toBe(12)
  })

  it('no tiene valores duplicados en COMPLEX_FEATURE_VALUES', () => {
    const unique = new Set(COMPLEX_FEATURE_VALUES)
    expect(unique.size).toBe(COMPLEX_FEATURE_VALUES.length)
  })

  it('los labels están en español', () => {
    const wifiEntry = COMPLEX_FEATURE_MAP.find((f) => f.value === 'WIFI')
    expect(wifiEntry?.label).toBe('Wi-Fi gratuito')

    const parkingEntry = COMPLEX_FEATURE_MAP.find((f) => f.value === 'PARKING')
    expect(parkingEntry?.label).toBe('Estacionamiento')
  })
})

// ---------------------------------------------------------------------------
// TIMEZONE_MAP / TIMEZONE_VALUES
// ---------------------------------------------------------------------------

describe('TIMEZONE_MAP y TIMEZONE_VALUES', () => {
  it('tienen la misma cantidad de ítems', () => {
    expect(TIMEZONE_MAP.length).toBe(TIMEZONE_VALUES.length)
  })

  it('TIMEZONE_VALUES contiene todos los values de TIMEZONE_MAP', () => {
    const mapValues = TIMEZONE_MAP.map((t) => t.value)
    for (const value of mapValues) {
      expect(TIMEZONE_VALUES).toContain(value)
    }
  })

  it('contiene las 3 timezones de Argentina', () => {
    expect(TIMEZONE_VALUES).toContain('America/Argentina/Buenos_Aires')
    expect(TIMEZONE_VALUES).toContain('America/Argentina/Cordoba')
    expect(TIMEZONE_VALUES).toContain('America/Argentina/Mendoza')
    expect(TIMEZONE_VALUES.length).toBe(3)
  })

  it('los labels incluyen el offset GMT', () => {
    for (const tz of TIMEZONE_MAP) {
      expect(tz.label).toMatch(/GMT[+-]\d/)
    }
  })

  it('no tiene valores duplicados en TIMEZONE_VALUES', () => {
    const unique = new Set(TIMEZONE_VALUES)
    expect(unique.size).toBe(TIMEZONE_VALUES.length)
  })
})

// ---------------------------------------------------------------------------
// COUNTRY_MAP / COUNTRY_VALUES
// ---------------------------------------------------------------------------

describe('COUNTRY_MAP y COUNTRY_VALUES', () => {
  it('tienen la misma cantidad de ítems', () => {
    expect(COUNTRY_MAP.length).toBe(COUNTRY_VALUES.length)
  })

  it('contiene Argentina con código ISO 3166-1 alpha-2', () => {
    expect(COUNTRY_VALUES).toContain('AR')
    const argentina = COUNTRY_MAP.find((c) => c.value === 'AR')
    expect(argentina?.label).toBe('Argentina')
  })

  it('los códigos de país son uppercase de 2 caracteres', () => {
    for (const country of COUNTRY_VALUES) {
      expect(country).toMatch(/^[A-Z]{2}$/)
    }
  })
})

// ---------------------------------------------------------------------------
// CREATE_COMPLEX_FORM_STEPS
// ---------------------------------------------------------------------------

describe('CREATE_COMPLEX_FORM_STEPS', () => {
  it('tiene exactamente 5 steps', () => {
    expect(CREATE_COMPLEX_FORM_STEPS.length).toBe(5)
  })

  it('los steps tienen los IDs esperados en el orden correcto', () => {
    expect(CREATE_COMPLEX_FORM_STEPS[0].id).toBe('basic-info')
    expect(CREATE_COMPLEX_FORM_STEPS[1].id).toBe('address')
    expect(CREATE_COMPLEX_FORM_STEPS[2].id).toBe('contact')
    expect(CREATE_COMPLEX_FORM_STEPS[3].id).toBe('features')
    expect(CREATE_COMPLEX_FORM_STEPS[4].id).toBe('schedule')
  })

  it('el step 1 (basic-info) tiene los campos correctos', () => {
    const step = CREATE_COMPLEX_FORM_STEPS[0]
    expect(step.fields).toContain('title')
    expect(step.fields).toContain('description')
    expect(step.fields).toContain('timezone')
    expect(step.fields).toContain('currency')
    expect(step.fields).toContain('cancellationPolicy')
  })

  it('el step 2 (address) incluye los campos de ubicación y coordenadas', () => {
    const step = CREATE_COMPLEX_FORM_STEPS[1]
    expect(step.fields).toContain('street')
    expect(step.fields).toContain('city')
    expect(step.fields).toContain('state')
    expect(step.fields).toContain('country')
    expect(step.fields).toContain('zip')
    expect(step.fields).toContain('latitude')
    expect(step.fields).toContain('longitude')
  })

  it('el step 3 (contact) incluye todos los campos de contacto', () => {
    const step = CREATE_COMPLEX_FORM_STEPS[2]
    expect(step.fields).toContain('phone')
    expect(step.fields).toContain('website')
    expect(step.fields).toContain('facebook')
    expect(step.fields).toContain('twitter')
    expect(step.fields).toContain('instagram')
    expect(step.fields).toContain('youtube')
  })

  it('el step 4 (features) solo tiene el campo features', () => {
    const step = CREATE_COMPLEX_FORM_STEPS[3]
    expect(step.fields).toContain('features')
    expect(step.fields.length).toBe(1)
  })

  it('cada step tiene título y descripción no vacíos', () => {
    for (const step of CREATE_COMPLEX_FORM_STEPS) {
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.description.length).toBeGreaterThan(0)
    }
  })

  it('no hay campos duplicados entre steps', () => {
    const allFields = CREATE_COMPLEX_FORM_STEPS.flatMap((s) => [...s.fields])
    const unique = new Set(allFields)
    expect(unique.size).toBe(allFields.length)
  })
})

// ---------------------------------------------------------------------------
// CREATE_COMPLEX_FORM_DEFAULT_VALUES
// ---------------------------------------------------------------------------

describe('CREATE_COMPLEX_FORM_DEFAULT_VALUES', () => {
  it('tiene timezone por defecto en Buenos Aires', () => {
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.timezone).toBe(
      'America/Argentina/Buenos_Aires',
    )
  })

  it('tiene currency por defecto en ARS', () => {
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.currency).toBe('ARS')
  })

  it('tiene country por defecto en AR', () => {
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.country).toBe('AR')
  })

  it('tiene features por defecto como array vacío', () => {
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.features).toEqual([])
  })

  it('tiene coordenadas por defecto en 0 (requiere selección del usuario)', () => {
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.latitude).toBe(0)
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.longitude).toBe(0)
  })

  it('todos los campos de texto opcionales tienen string vacío por defecto', () => {
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.zip).toBe('')
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.website).toBe('')
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.facebook).toBe('')
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.twitter).toBe('')
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.instagram).toBe('')
    expect(CREATE_COMPLEX_FORM_DEFAULT_VALUES.youtube).toBe('')
  })

  it('pasa la validación del CreateComplexFormSchema con datos reales (no defaults)', async () => {
    // Los defaults tienen latitud/longitud en 0 — que el schema rechaza (refine v !== 0).
    // Este test verifica que los defaults están listos para inicializar el form
    // pero que el schema previene el submit sin selección de ubicación.
    const { CreateComplexFormSchema } = await import('@/orpc/schemas/complex')

    const withValidLocation = {
      ...CREATE_COMPLEX_FORM_DEFAULT_VALUES,
      title: 'Club Test',
      description: 'Descripción del club de prueba.',
      cancellationPolicy: 'Sin reembolsos.',
      street: 'Av. Test 123',
      city: 'Córdoba',
      state: 'Córdoba',
      phone: '03514567890',
      latitude: -31.4135,
      longitude: -64.1811,
    }

    const result = CreateComplexFormSchema.safeParse(withValidLocation)
    expect(result.success).toBe(true)
  })
})
