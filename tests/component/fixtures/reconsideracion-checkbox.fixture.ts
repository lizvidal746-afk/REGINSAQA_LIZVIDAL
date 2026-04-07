// @ts-nocheck — Angular CT deshabilitado (@angular/core no instalado en QA project).
// DESHABILITADO: Angular CT no soportado por Playwright.
// Este archivo es referencia histórica — ver git log para la implementacion Angular.
// La cobertura equivalente esta en tests/casos-prueba (test:03, test:04).

export {}; // Silenciar TS sin imports de @angular/core (removido de package.json)

/**
 * Fixture standalone para probar la logica de habilitacion/deshabilitacion
 * de los checkboxes BitReconsidera / BitPago en la pantalla de Reconsideracion.
 *
 * Replica el estado y comportamiento de InfractorComponent sin depender
 * de PrimeNG, servicios HTTP ni del proyecto frontend clonado.
 */
@Component({
  selector: 'ct-recons-checkbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div data-testid="recons-panel">

      <div>
        <button
          data-testid="btn-editar"
          [disabled]="reconsEditando || reconsLoading || !idSeleccionado"
          (click)="activarEdicion()">Editar</button>
        <button
          data-testid="btn-guardar"
          [disabled]="!reconsEditando || reconsLoading"
          (click)="guardar()">Guardar</button>
        <button
          data-testid="btn-cancelar"
          [disabled]="!reconsEditando || reconsLoading"
          (click)="cancelar()">Cancelar</button>
      </div>

      <label>
        <input
          type="checkbox"
          data-testid="ck-presento-reconsideracion"
          [(ngModel)]="presentoReconsideracion"
          [disabled]="!reconsEditando || reconsLoading" />
        Presento Reconsideracion
      </label>

      <label>
        <input
          type="checkbox"
          data-testid="ck-pago"
          [(ngModel)]="reconsPago"
          [disabled]="!reconsEditando || reconsLoading" />
        Pago la sancion
      </label>

      <label>
        <input
          type="checkbox"
          data-testid="ck-reconsidera"
          [(ngModel)]="reconsReconsidera"
          [disabled]="!reconsEditando || reconsLoading" />
        Reconsidera
      </label>

    </div>
  `,
})
export class ReconsideracionCheckboxFixture implements OnInit {
  @Input() idSeleccionado: number | null = null;
  @Input() bitPago: number = 0;
  @Input() bitReconsidera: number = 0;
  @Output() saved = new EventEmitter<{ bitPago: number; bitReconsidera: number; presentoReconsideracion: boolean }>();

  reconsEditando        = false;
  reconsLoading         = false;
  reconsPago            = false;
  reconsReconsidera     = false;
  presentoReconsideracion = false;

  ngOnInit(): void {
    this.reconsPago        = !!this.bitPago;
    this.reconsReconsidera = !!this.bitReconsidera;
  }

  activarEdicion(): void {
    if (!this.idSeleccionado || this.reconsEditando || this.reconsLoading) return;
    this.reconsEditando = true;
  }

  guardar(): void {
    if (!this.reconsEditando || this.reconsLoading) return;
    this.reconsLoading = true;
    setTimeout(() => {
      this.saved.emit({
        bitPago:                 this.reconsPago ? 1 : 0,
        bitReconsidera:          this.reconsReconsidera ? 1 : 0,
        presentoReconsideracion: this.presentoReconsideracion,
      });
      this.reconsEditando = false;
      this.reconsLoading  = false;
    }, 50);
  }

  cancelar(): void {
    if (!this.reconsEditando) return;
    this.reconsEditando          = false;
    this.reconsPago              = !!this.bitPago;
    this.reconsReconsidera       = !!this.bitReconsidera;
    this.presentoReconsideracion = false;
    this.reconsLoading           = false;
  }
}
