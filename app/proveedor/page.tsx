'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ProveedorDashboard() {
  const router = useRouter();
  const [carreras, setCarreras] = useState<any[]>([]);
  const [provData, setProvData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  // ESTADO PARA EL CÁLCULO DEL LÍMITE DE CRÉDITOS
  const [creditosSemanaActual, setCreditosSemanaActual] = useState(0);
  const [fechasSemanaStr, setFechasSemanaStr] = useState(''); // Para mostrar en el banner

  useEffect(() => {
    const cargarDatosProveedor = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/');

      const { data: perfil } = await supabase.from('perfiles_usuario').select('proveedor_id').eq('id', session.user.id).single();
      if (!perfil || !perfil.proveedor_id) return alert('Cuenta no enlazada.');

      const { data: prov } = await supabase.from('proveedores').select('nombre_proveedor, cuota_frecuencia').eq('id', perfil.proveedor_id).single();
      if (prov) setProvData(prov);

      const { data: carrerasData } = await supabase
        .from('carreras')
        .select(`*, perfiles_usuario(nombre_completo), unidades(numero_equipo)`)
        .eq('proveedor_id', perfil.proveedor_id)
        .order('fecha', { ascending: false })
        .order('hora_salida', { ascending: false });

      if (carrerasData) {
        setCarreras(carrerasData);

        // LÓGICA PARA SEMANA DE CORTE (SÁBADO A VIERNES)
        const now = new Date();
        const day = now.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mie, 4: Jue, 5: Vie, 6: Sab
        
        // Si hoy es Sábado (6) restamos 0. Si es Domingo (0) restamos 1. Si es Viernes (5) restamos 6.
        const diasParaRestar = day === 6 ? 0 : day + 1;
        
        const sabadoInicio = new Date(now);
        sabadoInicio.setDate(now.getDate() - diasParaRestar);
        
        const viernesFin = new Date(sabadoInicio);
        viernesFin.setDate(sabadoInicio.getDate() + 6); // El viernes es 6 días después del sábado

        // Formateador YYYY-MM-DD
        const format = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const start = format(sabadoInicio);
        const end = format(viernesFin);
        
        // Guardamos las fechas legibles para el banner
        setFechasSemanaStr(`${start} al ${end}`);

        // Sumamos solo los créditos que caen en este ciclo de sábado a viernes
        let sumaCreditos = 0;
        carrerasData.forEach((c: any) => {
          if (c.metodo_pago === 'Credito' && c.fecha >= start && c.fecha <= end) {
            sumaCreditos += parseFloat(c.valor || 0);
          }
        });
        setCreditosSemanaActual(sumaCreditos);
      }
      setLoading(false);
    };
    cargarDatosProveedor();
  }, [router]);

  const carrerasFiltradas = carreras.filter(c => {
    let coincideFecha = true;
    if (fechaInicio && fechaFin) {
      coincideFecha = c.fecha >= fechaInicio && c.fecha <= fechaFin;
    } else if (fechaInicio) {
      coincideFecha = c.fecha >= fechaInicio;
    } else if (fechaFin) {
      coincideFecha = c.fecha <= fechaFin;
    }
    return coincideFecha;
  });

  let totalCreditos = 0; 
  let totalComision = 0;
  let totalBruto = 0;
  const cuotaFrecuencia = parseFloat(provData?.cuota_frecuencia || 0);

  carrerasFiltradas.forEach(c => {
    const valor = parseFloat(c.valor || 0);
    totalBruto += valor;
    if (valor > 5 && !c.exento_comision) totalComision += valor * 0.10;
    if (c.metodo_pago === 'Credito') totalCreditos += valor;
  });

  // MATEMÁTICA CORREGIDA: Créditos - Comisión + Frecuencia
  let totalCalculado = 0;
  if (totalCreditos > 0) {
    totalCalculado = totalCreditos - totalComision + cuotaFrecuencia;
  } else {
    // Si no hay créditos, se resta a su favor
    totalCalculado = -(totalComision - cuotaFrecuencia);
  }

  const finanzas = {
    creditos: totalCreditos,
    comision: totalComision,
    frecuencia: cuotaFrecuencia,
    total: totalCalculado
  };

  const limpiarFiltros = () => {
    setFechaInicio('');
    setFechaFin('');
  };

  const generarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text(`Estado de Cuenta - ${provData?.nombre_proveedor}`, 14, 22);
    doc.setFontSize(11); 
    
    let textoFiltro = `Generado el: ${new Date().toLocaleDateString()}`;
    if (fechaInicio && fechaFin) textoFiltro += ` | Período: ${fechaInicio} al ${fechaFin}`;
    doc.text(textoFiltro, 14, 30);
    
    doc.text(`Total Bruto: $${totalBruto.toFixed(2)}`, 14, 40);
    doc.text(`Créditos a pagar: $${finanzas.creditos.toFixed(2)}`, 14, 46);
    doc.text(`Comisión en favor: -$${finanzas.comision.toFixed(2)}`, 14, 52);
    doc.text(`Frecuencia: +$${finanzas.frecuencia.toFixed(2)}`, 14, 58);
    doc.setFont('', 'bold'); doc.text(`TOTAL A CANCELAR: $${finanzas.total.toFixed(2)}`, 14, 66);

    const tableData = carrerasFiltradas.map(c => {
      const valorNum = parseFloat(c.valor || 0);
      const comisionNum = (valorNum > 5 && !c.exento_comision) ? valorNum * 0.10 : 0;
      
      return [
        `${c.fecha}\n${c.hora_salida}`, 
        `${c.cliente}\n(${c.servicio_a})${c.centro_costo ? `\nCC: ${c.centro_costo}` : ''}`,
        `${c.inicio} ->\n${c.destino}`, `U: ${c.unidades?.numero_equipo || 'N/A'}\nOp: ${c.perfiles_usuario?.nombre_completo || 'N/A'}`,
        `$${valorNum.toFixed(2)} (${c.metodo_pago})\n${comisionNum > 0 ? `- $${comisionNum.toFixed(2)} Com.` : c.exento_comision ? 'Sin Com. (Exento)' : 'Sin Com.'}`
      ];
    });

    autoTable(doc, { startY: 71, head: [['Fecha/Hora', 'Servicio', 'Ruta', 'Logística', 'Finanzas']], body: tableData, theme: 'grid', styles: { fontSize: 8 } });
    doc.save(`Estado_Cuenta_${provData?.nombre_proveedor?.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Portal del Proveedor</h1>
            <p className="text-orange-600 font-medium text-sm">{provData?.nombre_proveedor}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={generarPDF} className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">Descargar Estado de Cuenta</button>
            <button onClick={() => { supabase.auth.signOut(); router.push('/'); }} className="bg-white border border-red-300 text-red-600 px-4 py-2 rounded-lg">Cerrar Sesión</button>
          </div>
        </div>

        {/* --- BANNER DE ADVERTENCIA DE CRÉDITO (Calculado de Sábado a Viernes) --- */}
        {!loading && creditosSemanaActual >= 50 && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 md:p-5 mb-6 rounded-r-xl shadow-sm flex items-start gap-4">
            <div className="text-amber-500 text-2xl pt-1">⚠️</div>
            <div>
              <h3 className="text-amber-800 font-bold text-lg">Límite de Créditos Alcanzado</h3>
              <p className="text-amber-700 text-sm mt-1">
                Te notificamos que has alcanzado el monto máximo de gestión de <strong>$50.00</strong> en créditos para esta semana del ({fechasSemanaStr}). 
                <br/>Créditos acumulados actualmente: <strong>${creditosSemanaActual.toFixed(2)}</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde (Fecha Inicio)</label>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 text-green-600 focus:ring-black outline-none" />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta (Fecha Fin)</label>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 text-rose-700 focus:ring-black outline-none" />
          </div>
          <div className="w-full md:w-auto">
            <button onClick={limpiarFiltros} className="w-full px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors h-[42px]">
              Limpiar Filtros
            </button>
          </div>
        </div>

        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">Créditos a cancelar</p>
              <p className="text-xl font-bold text-blue-700">${finanzas.creditos.toFixed(2)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">Comisión a favor</p>
              <p className="text-xl font-bold text-red-600">-${finanzas.comision.toFixed(2)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">Frecuencia Fija</p>
              <p className="text-xl font-bold text-green-600">+${finanzas.frecuencia.toFixed(2)}</p>
            </div>
            <div className="bg-black p-4 rounded-xl shadow-sm border border-black">
              <p className="text-sm font-medium text-gray-400 mb-1">A Cancelar (Neto)</p>
              <p className="text-xl font-bold text-white">${finanzas.total.toFixed(2)}</p>
            </div>
          </div>
        )}

        <h3 className="font-semibold text-gray-900 mb-3 flex items-center justify-between">
          <span>Tus Carreras Registradas</span>
          <span className="text-sm font-normal text-gray-500">{carrerasFiltradas.length} resultados</span>
        </h3>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando tus datos...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Fecha/Hora</th>
                    <th className="px-6 py-4">Servicio</th>
                    <th className="px-6 py-4">Ruta</th>
                    <th className="px-6 py-4">Operador / Unidad</th>
                    <th className="px-6 py-4">Finanzas Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {carrerasFiltradas.map((carrera) => {
                    const valorNum = parseFloat(carrera.valor || 0);
                    const comisionNum = (valorNum > 5 && !carrera.exento_comision) ? valorNum * 0.10 : 0;
                    return (
                      <tr key={carrera.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{carrera.fecha}</div>
                          <div className="text-gray-500">{carrera.hora_salida}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{carrera.cliente}</div>
                          <div className="text-gray-500">{carrera.servicio_a}</div>
                          {carrera.centro_costo && <div className="text-xs font-medium text-indigo-600 mt-1">CC: {carrera.centro_costo}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900"><span className="text-gray-500">De:</span> {carrera.inicio}</div>
                          <div className="text-gray-900"><span className="text-gray-500">A:</span> {carrera.destino}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900 text-xs">Unidad: {carrera.unidades?.numero_equipo}</div>
                          <div className="text-gray-500 text-xs mt-1">Op: {carrera.perfiles_usuario?.nombre_completo}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">${valorNum.toFixed(2)}</div>
                          <div className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full inline-block mt-1">{carrera.metodo_pago}</div>
                          {comisionNum > 0 ? (
                            <div className="text-xs font-medium text-red-500 mt-1">- ${comisionNum.toFixed(2)} (Comisión)</div>
                          ) : carrera.exento_comision ? (
                            <div className="text-xs font-medium text-green-600 mt-1">✓ Exento (Sin Com.)</div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {carrerasFiltradas.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No hay carreras en este rango de fechas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}