/**
 * PT-PT messages: the source of truth. `en.ts` must have exactly the same keys (enforced by its
 * type and by a test). User data (leagues, teams, markets, notes) is never translated.
 */
const ptPT = {
  app: {
    brand: 'Edgebook',
    mainNav: 'Principal',
    nav: {
      today: 'Hoje',
      predictions: 'Registo',
      multiples: 'Múltiplas',
      dashboard: 'Dashboard',
      settings: 'Definições',
    },
    language: {
      toggle: 'Mudar idioma',
      'pt-PT': 'Português',
      en: 'English',
    },
    theme: {
      toDark: 'Tema escuro',
      toLight: 'Tema claro',
    },
  },
  confidence: {
    1: 'Palpite',
    2: 'Moderada',
    3: 'Boa',
    4: 'Alta',
    5: 'Muito alta',
  },
  primevue: {
    today: 'Hoje',
    clear: 'Limpar',
    weekHeader: 'Sem',
    chooseYear: 'Escolher ano',
    chooseMonth: 'Escolher mês',
    chooseDate: 'Escolher data',
    prevYear: 'Ano anterior',
    nextYear: 'Ano seguinte',
    prevMonth: 'Mês anterior',
    nextMonth: 'Mês seguinte',
    accept: 'Sim',
    reject: 'Não',
  },
}

export type Messages = typeof ptPT

export default ptPT
