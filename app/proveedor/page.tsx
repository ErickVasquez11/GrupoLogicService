'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ProveedorDashboard() {
  const router = useRouter();
  const [carreras, setCarreras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombreProveedor, setNombreProveedor] = useState('');
  
  const [finanzas, setFinanzas] = useState({ creditos: 0, comision: 0, frecuencia: 0, total: 0 });

  useEffect(() => {
    const cargarDatosProveedor = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/');

      const { data: perfil } = await supabase.from('perfiles_usuario').select('proveedor_id').eq('id', session.user.id).single();
      if (!perfil || !perfil.proveedor_id) return alert('Cuenta no enlazada.');

      const { data: prov } = await supabase.from('proveedores').select('nombre_proveedor, cuota_frecuencia').eq('id', perfil.proveedor_id).single();
      if (prov) setNombreProveedor(prov.nombre_proveedor);

      const { data: carrerasData } = await supabase
        .from('carreras')
        .select(`*, perfiles_usuario(nombre_completo), unidades(numero_equipo)`)
        .eq('proveedor_id', perfil.proveedor_id)
        .order('fecha', { ascending: false })
        .order('hora_salida', { ascending: false });

      if (carrerasData) {
        setCarreras(carrerasData);
        let totalCreditos = 0; let totalComision = 0;
        const cuotaFrecuencia = parseFloat(prov?.cuota_frecuencia || 0);

        carrerasData.forEach(c => {
          const valor = parseFloat(c.valor || 0);
          if (valor > 5) totalComision += valor * 0.10;
          if (c.metodo_pago === 'Credito') totalCreditos += valor;
        });

        setFinanzas({
          creditos: totalCreditos,
          comision: totalComision,
          frecuencia: cuotaFrecuencia,
          total: totalCreditos - totalComision - cuotaFrecuencia
        });
      }
      setLoading(false);
    };
    cargarDatosProveedor();
  }, [router]);

  const generarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text(`Estado de Cuenta - ${nombreProveedor}`, 14, 22);
    doc.setFontSize(11); doc.text(`Generado el: ${new Date().toLocaleDateString()}`, 14, 30);
    
    doc.text(`Total Créditos: $${finanzas.creditos.toFixed(2)}`, 14, 40);
    doc.text(`Comisión Descontada: -$${finanzas.comision.toFixed(2)}`, 14, 46);
    doc.text(`Pago de Frecuencia: -$${finanzas.frecuencia.toFixed(2)}`, 14, 52);
    doc.setFont('', 'bold'); doc.text(`TOTAL A CANCELAR: $${finanzas.total.toFixed(2)}`, 14, 60);

    const tableData = carreras.map(c => [
      `${c.fecha}\n${c.hora_salida}`, 
      // AGREGADO EL CENTRO DE COSTO AL PDF
      `${c.cliente}\n(${c.servicio_a})${c.centro_costo ? `\nCC: ${c.centro_costo}` : ''}`,
      `${c.inicio} ->\n${c.destino}`, `U: ${c.unidades?.numero_equipo || 'N/A'}\nOp: ${c.perfiles_usuario?.nombre_completo || 'N/A'}`,
      `$${c.valor} (${c.metodo_pago})`
    ]);

    autoTable(doc, { startY: 65, head: [['Fecha/Hora', 'Servicio', 'Ruta', 'Logística', 'Finanzas']], body: tableData, theme: 'grid', styles: { fontSize: 8 } });
    doc.save(`Estado_Cuenta_${nombreProveedor.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div><h1 className="text-2xl font-bold text-gray-900">Portal del Proveedor</h1><p className="text-orange-600 text-sm">{nombreProveedor}</p></div>
          <div className="flex gap-3">
            <button onClick={generarPDF} className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">Descargar Estado de Cuenta</button>
            <button onClick={() => { supabase.auth.signOut(); router.push('/'); }} className="bg-white border border-red-300 text-red-600 px-4 py-2 rounded-lg">Cerrar Sesión</button>
          </div>
        </div>

        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">Créditos</p>
              <p className="text-xl font-bold text-blue-700">${finanzas.creditos.toFixed(2)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">Comisión (10%)</p>
              <p className="text-xl font-bold text-red-600">-${finanzas.comision.toFixed(2)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">Frecuencia Fija</p>
              <p className="text-xl font-bold text-red-600">-${finanzas.frecuencia.toFixed(2)}</p>
            </div>
            <div className="bg-black p-4 rounded-xl shadow-sm border border-black">
              <p className="text-sm font-medium text-gray-400 mb-1">A Cancelar (Neto)</p>
              <p className="text-xl font-bold text-white">${finanzas.total.toFixed(2)}</p>
            </div>
          </div>
        )}

        <h3 className="font-semibold text-gray-900 mb-3">Tus Carreras Registradas</h3>
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
                  {carreras.map((carrera) => {
                    const valorNum = parseFloat(carrera.valor || 0);
                    const comisionNum = valorNum > 5 ? valorNum * 0.10 : 0;
                    return (
                      <tr key={carrera.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{carrera.fecha}</div>
                          <div className="text-gray-500">{carrera.hora_salida}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{carrera.cliente}</div>
                          <div className="text-gray-500">{carrera.servicio_a}</div>
                          {/* AGREGADO EL CENTRO DE COSTO A LA TABLA */}
                          {carrera.centro_costo && (
                            <div className="text-xs font-medium text-indigo-600 mt-1">CC: {carrera.centro_costo}</div>
                          )}
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
                          <div className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full inline-block mt-1">
                            {carrera.metodo_pago}
                          </div>
                          {comisionNum > 0 && <div className="text-xs font-medium text-red-500 mt-1">- ${comisionNum.toFixed(2)} (Comisión)</div>}
                        </td>
                      </tr>
                    );
                  })}
                  {carreras.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No tienes carreras registradas.</td></tr>
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