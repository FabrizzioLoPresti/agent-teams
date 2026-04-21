import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchAddress } from '@/lib/geocoding/nominatim'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockNominatimResponse = [
  {
    lat: '-31.4201',
    lon: '-64.1888',
    display_name:
      'Paysandú, 1051, Nueva Córdoba, Córdoba, Departamento Capital, Córdoba, X5000, Argentina',
    address: {
      road: 'Paysandú',
      house_number: '1051',
      city: 'Córdoba',
      state: 'Córdoba',
      country_code: 'ar',
      postcode: 'X5000',
    },
  },
  {
    lat: '-31.4135',
    lon: '-64.1811',
    display_name: 'Av. Colón, 1234, Córdoba, Argentina',
    address: {
      road: 'Av. Colón',
      house_number: '1234',
      city: 'Córdoba',
      state: 'Córdoba',
      country_code: 'ar',
      postcode: '5000',
    },
  },
]

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockNominatimResponse,
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests: comportamiento general
// ---------------------------------------------------------------------------

describe('searchAddress — comportamiento general', () => {
  it('retorna array vacío para query vacío', async () => {
    const result = await searchAddress('')
    expect(result).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retorna array vacío para query con solo espacios', async () => {
    const result = await searchAddress('   ')
    expect(result).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('llama a Nominatim con los parámetros correctos', async () => {
    await searchAddress('Paysandú 1051 Córdoba')

    expect(fetch).toHaveBeenCalledOnce()
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]

    expect(url).toContain('nominatim.openstreetmap.org/search')
    expect(url).toContain('q=Paysan')
    expect(url).toContain('format=json')
    expect(url).toContain('limit=6')
    expect(url).toContain('addressdetails=1')
    expect(url).toContain('countrycodes=ar')
    expect(options.headers).toMatchObject({
      'User-Agent': expect.stringContaining('AltaCancha'),
    })
  })

  it('parsea correctamente la respuesta de Nominatim', async () => {
    const results = await searchAddress('Paysandú Córdoba')

    expect(results).toHaveLength(2)

    const first = results[0]
    expect(first.latitude).toBe(-31.4201)
    expect(first.longitude).toBe(-64.1888)
    expect(first.street).toBe('Paysandú 1051')
    expect(first.city).toBe('Córdoba')
    expect(first.state).toBe('Córdoba')
    expect(first.country).toBe('AR') // uppercase
    expect(first.zip).toBe('X5000')
    expect(first.displayName).toBe(
      'Paysandú, 1051, Nueva Córdoba, Córdoba, Departamento Capital, Córdoba, X5000, Argentina',
    )
  })

  it('convierte country_code a mayúsculas', async () => {
    const results = await searchAddress('Córdoba')
    expect(results[0].country).toBe('AR')
  })
})

// ---------------------------------------------------------------------------
// Tests: parseo de campos de dirección
// ---------------------------------------------------------------------------

describe('searchAddress — parseo de address', () => {
  it('usa city cuando está disponible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '-31.0',
            lon: '-64.0',
            display_name: 'Test',
            address: { city: 'Córdoba', state: 'Córdoba', country_code: 'ar' },
          },
        ],
      }),
    )

    const results = await searchAddress('Córdoba')
    expect(results[0].city).toBe('Córdoba')
  })

  it('usa town como fallback cuando no hay city', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '-31.0',
            lon: '-64.0',
            display_name: 'Test',
            address: { town: 'Villa María', state: 'Córdoba', country_code: 'ar' },
          },
        ],
      }),
    )

    const results = await searchAddress('Villa María')
    expect(results[0].city).toBe('Villa María')
  })

  it('usa village como fallback cuando no hay city ni town', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '-31.0',
            lon: '-64.0',
            display_name: 'Test',
            address: { village: 'Los Reartes', state: 'Córdoba', country_code: 'ar' },
          },
        ],
      }),
    )

    const results = await searchAddress('Los Reartes')
    expect(results[0].city).toBe('Los Reartes')
  })

  it('combina road + house_number para el campo street', async () => {
    const results = await searchAddress('Paysandú 1051')
    expect(results[0].street).toBe('Paysandú 1051')
  })

  it('usa solo road cuando no hay house_number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '-31.0',
            lon: '-64.0',
            display_name: 'Test',
            address: { road: 'Av. Colón', city: 'Córdoba', country_code: 'ar' },
          },
        ],
      }),
    )

    const results = await searchAddress('Av. Colón')
    expect(results[0].street).toBe('Av. Colón')
  })

  it('retorna string vacío para zip cuando no hay postcode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '-31.0',
            lon: '-64.0',
            display_name: 'Test',
            address: { city: 'Córdoba', country_code: 'ar' },
          },
        ],
      }),
    )

    const results = await searchAddress('Córdoba')
    expect(results[0].zip).toBe('')
  })

  it('usa "ar" como country_code por defecto cuando no está en address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '-31.0',
            lon: '-64.0',
            display_name: 'Test',
            address: { city: 'Córdoba' },
          },
        ],
      }),
    )

    const results = await searchAddress('Córdoba')
    expect(results[0].country).toBe('AR')
  })
})

// ---------------------------------------------------------------------------
// Tests: filtrado de resultados inválidos
// ---------------------------------------------------------------------------

describe('searchAddress — filtrado de resultados inválidos', () => {
  it('filtra resultados con coordenadas NaN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: 'invalid',
            lon: 'invalid',
            display_name: 'Invalid',
            address: {},
          },
          ...mockNominatimResponse,
        ],
      }),
    )

    const results = await searchAddress('Córdoba')
    // El item inválido es filtrado, solo quedan los 2 de mockNominatimResponse
    expect(results).toHaveLength(2)
    results.forEach((r) => {
      expect(isNaN(r.latitude)).toBe(false)
      expect(isNaN(r.longitude)).toBe(false)
    })
  })

  it('filtra items que no tienen lat/lon como string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { lat: 123, lon: '-64.0', display_name: 'Bad lat type' }, // lat no es string
          ...mockNominatimResponse,
        ],
      }),
    )

    const results = await searchAddress('Córdoba')
    expect(results).toHaveLength(2)
  })

  it('filtra items que no tienen display_name como string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { lat: '-31.0', lon: '-64.0', display_name: null },
          ...mockNominatimResponse,
        ],
      }),
    )

    const results = await searchAddress('Córdoba')
    expect(results).toHaveLength(2)
  })

  it('retorna array vacío cuando Nominatim retorna array vacío', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    )

    const results = await searchAddress('xyzzy inexistente')
    expect(results).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Tests: manejo de errores
// ---------------------------------------------------------------------------

describe('searchAddress — manejo de errores', () => {
  it('lanza error cuando la respuesta HTTP no es ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({}),
      }),
    )

    await expect(searchAddress('Córdoba')).rejects.toThrow('Nominatim error: 429')
  })

  it('lanza error cuando la respuesta no es un array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: 'Unable to geocode' }),
      }),
    )

    await expect(searchAddress('Córdoba')).rejects.toThrow(
      'Nominatim returned an unexpected response format.',
    )
  })

  it('propaga errores de red', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network failure')),
    )

    await expect(searchAddress('Córdoba')).rejects.toThrow('Network failure')
  })
})
