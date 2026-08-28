import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

/**
 * Red de seguridad ante un error de render.
 *
 * Sin esto, cualquier excepción durante el render desmonta el árbol entero y
 * deja la pantalla en blanco, sin pista de qué pasó ni forma de volver salvo
 * recargar a ciegas. En una app instalada como PWA eso se ve como si estuviera
 * simplemente rota.
 *
 * Sigue siendo un componente de clase porque React no ofrece equivalente en
 * hooks: `getDerivedStateFromError` y `componentDidCatch` solo existen aquí.
 */

interface Props {
  children: ReactNode;
}

interface Estado {
  error: Error | null;
}

export default class LimiteDeError extends Component<Props, Estado> {
  override state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Queda en la consola para poder diagnosticarlo desde las herramientas del
    // navegador. No se manda a ningún servicio externo: son finanzas
    // personales y el stack puede arrastrar datos de la pantalla.
    console.error('Error de render capturado:', error, info.componentStack);
  }

  private reintentar = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="card w-full max-w-md p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-campo bg-sale-suave p-3 text-sale">
              <TriangleAlert size={20} aria-hidden />
            </span>
            <h1 className="text-lg font-bold text-tinta">Algo se rompió</h1>
          </div>

          <p className="text-sm text-tinta-2">
            La pantalla falló al dibujarse. Tus datos están a salvo: esto ocurrió en la interfaz, no
            en la base.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-campo bg-elevado p-3 text-xs text-tinta-2">
            {error.message}
          </pre>

          <div className="mt-5 flex gap-2">
            <button type="button" className="button-primary flex-1" onClick={this.reintentar}>
              <RotateCcw size={16} aria-hidden /> Reintentar
            </button>
            <button
              type="button"
              className="button-secondary flex-1"
              onClick={() => window.location.reload()}
            >
              Recargar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
