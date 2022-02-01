import { format } from 'sql-formatter'
import { orderBy } from 'lodash'
import { computed, watch, proxyRefs, shallowRef } from '@vue/composition-api'

// Composables
import { usePager, PagerConfig } from '@/use/pager'
import { useOrder, Order } from '@/use/order'
import { useWatchAxios, AxiosRequestSource } from '@/use/watch-axios'
import { QueryPart } from '@/use/uql'

// Utilities
import { xkey, splitTypeSystem } from '@/models/otelattr'

export interface ColumnInfo {
  name: string
  isNum: boolean
  isGroup: boolean
}

export interface ExploreItem extends Record<string, any> {}

export type UseSpanExplore = ReturnType<typeof useSpanExplore>

interface SpanExploreConfig {
  pager?: PagerConfig
  order?: Order
}

interface TypeItem {
  type: string
  numGroup: number
}

export function useSpanExplore(reqSource: AxiosRequestSource, cfg: SpanExploreConfig = {}) {
  const pager = usePager(cfg.pager ?? { perPage: 10 })
  const order = useOrder(
    cfg.order ?? {
      column: xkey.spanCountPerMin,
      desc: true,
    },
  )
  const typeFilter = shallowRef<string[]>([])

  const { loading, error, data } = useWatchAxios(
    () => {
      return reqSource()
    },
    { ignoreErrors: true },
  )

  const items = computed((): ExploreItem[] => {
    return data.value?.groups ?? []
  })

  const filteredItems = computed(() => {
    if (!typeFilter.value.length) {
      return items.value
    }

    return items.value.filter((item) => {
      const system = item[xkey.spanSystem]
      if (!system) {
        return true
      }
      const [typ] = splitTypeSystem(system)
      return typeFilter.value.indexOf(typ) >= 0
    })
  })

  const sortedItems = computed((): ExploreItem[] => {
    if (!order.column) {
      return filteredItems.value
    }

    const isDate = isDateField(order.column)
    return orderBy(
      filteredItems.value,
      (item: ExploreItem) => {
        const val = item[order.column!]
        return isDate ? new Date(val) : val
      },
      order.desc ? 'desc' : 'asc',
    )
  })

  const pageItems = computed((): ExploreItem[] => {
    const pageItems = sortedItems.value.slice(pager.pos.start, pager.pos.end)
    return pageItems
  })

  const queryParts = computed((): QueryPart[] => {
    return data.value?.queryParts
  })

  const columns = computed((): ColumnInfo[] => {
    let columns: ColumnInfo[] = data.value?.columns ?? []
    return columns
  })

  const groupColumns = computed((): ColumnInfo[] => {
    return columns.value.filter((col) => col.isGroup)
  })

  const plotColumns = computed((): ColumnInfo[] => {
    return columns.value.filter((col) => col.isNum)
  })

  const errorMessage = computed(() => {
    return error.value?.response?.data?.message ?? ''
  })

  const errorCode = computed(() => {
    return error.value?.response?.data?.code ?? ''
  })

  const query = computed((): string => {
    return format(error.value?.response?.data?.query ?? '')
  })

  const types = computed((): TypeItem[] => {
    const typeMap: Record<string, TypeItem> = {}

    for (let item of items.value) {
      const system = item[xkey.spanSystem]
      if (!system) {
        continue
      }

      const [type] = splitTypeSystem(system)
      let typeItem = typeMap[type]
      if (!typeItem) {
        typeItem = {
          type,
          numGroup: 0,
        }
        typeMap[type] = typeItem
      }
      typeItem.numGroup++
    }

    const types: TypeItem[] = []

    for (let type in typeMap) {
      types.push(typeMap[type])
    }

    orderBy(types, 'type')
    return types
  })

  watch(
    items,
    (items) => {
      pager.numItem = items.length
    },
    { immediate: true, flush: 'pre' },
  )

  watch(
    filteredItems,
    (items) => {
      pager.numItem = items.length
    },
    { immediate: true, flush: 'pre' },
  )

  return proxyRefs({
    pager,
    order,

    loading,

    items: sortedItems,
    pageItems,
    typeFilter,
    types,

    queryParts,
    columns,
    groupColumns,
    plotColumns,

    error,
    errorCode,
    errorMessage,
    query,
  })
}

function isDateField(s: string): boolean {
  return s === xkey.spanTime || hasField(s, 'time') || hasField(s, 'date')
}

function hasField(s: string, field: string): boolean {
  return s.endsWith('.' + field) || s.endsWith('_' + field)
}
