<template>
  <section class="rounded-2xl border border-eb-border bg-eb-surface p-6">
    <h1 class="m-0 text-[22px] font-bold tracking-tight">Página não encontrada</h1>
    <RouterLink
      :to="{ name: 'today' }"
      class="mt-3 inline-flex min-h-11 items-center font-semibold text-eb-accent-text"
    >
      Voltar ao início
    </RouterLink>
  </section>
</template>
