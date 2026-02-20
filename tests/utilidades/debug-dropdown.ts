/**
 * DEBUG: Inspeccionar Estructura del Dropdown
 * 
 * Este archivo contiene utilidades para depuración del dropdown de administrado.
 * Úsalo para entender la estructura DOM real y mejorar los selectores.
 */

import { Page } from '@playwright/test';

/**
 * Inspecciona el dropdown y log todos los elementos encontrados
 */
export async function inspeccionarDropdown(page: Page): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 INSPECCIÓN DE DROPDOWN - DIAGNÓSTICO COMPLETO');
  console.log('='.repeat(80));

  try {
    // 1. Verificar que página está abierta
    console.log('\n1️⃣  Verificando que página está abierta...');
    try {
      const title = await page.title();
      console.log(`   ✅ Página abierta: "${title}"`);
    } catch (e) {
      console.error('   ❌ CRÍTICO: Página cerrada o contexto no disponible');
      throw new Error('Página cerrada - no se puede continuar');
    }

    // 2. Contar dropdowns
    console.log('\n2️⃣  Contando dropdowns abiertos...');
    let dropdownCount = 0;
    try {
      dropdownCount = await page.locator('.ant-select-dropdown').count();
      console.log(`   ✅ Dropdowns encontrados: ${dropdownCount}`);
    } catch (e) {
      console.error('   ❌ No se pudo contar dropdowns:', e instanceof Error ? e.message : String(e));
      return;
    }

    if (dropdownCount === 0) {
      console.log('   ⚠️  No hay dropdowns abiertos. ¿Se abrió realmente el dropdown?');
      return;
    }

    // 3. Analizar elementos dentro del dropdown
    console.log('\n3️⃣  ANÁLISIS DE ELEMENTOS EN DROPDOWN:');

    const selectors = [
      { name: 'li', selector: '.ant-select-dropdown li' },
      { name: 'li.ant-select-item', selector: '.ant-select-dropdown li.ant-select-item' },
      { name: 'div[role="option"]', selector: '.ant-select-dropdown div[role="option"]' },
      { name: '.ant-select-item-option', selector: '.ant-select-dropdown .ant-select-item-option' },
      { name: '.ant-select-item-option-content', selector: '.ant-select-dropdown .ant-select-item-option-content' },
      { name: 'span', selector: '.ant-select-dropdown span' },
    ];

    for (const { name, selector } of selectors) {
      try {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`   ✅ ${name}: ${count} elementos`);
        } else {
          console.log(`   ⚠️  ${name}: ${count} elementos`);
        }
      } catch (e) {
        console.log(`   ❌ ${name}: ERROR`);
      }
    }

    // 4. Mostrar contenido de los primeros li
    console.log('\n4️⃣  CONTENIDO DE ELEMENTOS (primeros 5):');
    try {
      const lis = await page.locator('.ant-select-dropdown li').all();
      if (lis.length > 0) {
        for (let i = 0; i < Math.min(lis.length, 5); i++) {
          try {
            const text = await lis[i].textContent();
            console.log(`   [${i}] "${text?.trim()}"`);
          } catch (e) {
            console.log(`   [${i}] ERROR al leer texto`);
          }
        }
      } else {
        console.log('   ⚠️  No hay elementos li en el dropdown');
      }
    } catch (e) {
      console.log('   ❌ Error al leer contenido');
    }

  } catch (error) {
    console.error('\n❌ ERROR CRÍTICO EN INSPECCIÓN:', error instanceof Error ? error.message : String(error));
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Intenta seleccionar el primer administrado visible
 */
export async function seleccionarPrimeraOpcion(page: Page): Promise<string> {
  console.log('\n🎯 Intentando seleccionar primera opción...\n');

  try {
    // Verificar página
    try {
      await page.title();
    } catch (e) {
      console.error('❌ Página cerrada - no se puede seleccionar');
      return 'ERROR_PAGE_CLOSED';
    }

    // Intentar con selector simple
    const firstLi = page.locator('.ant-select-dropdown li').first();
    
    try {
      const isVisible = await firstLi.isVisible({ timeout: 2000 });
      if (isVisible) {
        const text = await firstLi.textContent();
        console.log(`✅ Elemento encontrado: "${text?.trim()}"`);
        console.log('   (no se selecciona, solo para inspección)');
        return text?.trim() || 'Desconocido';
      }
    } catch (e) {
      console.log('❌ No se encontraron elementos li');
      return 'NO_ENCONTRADO';
    }

    return 'NO_ENCONTRADO';
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    return 'ERROR';
  }
}
