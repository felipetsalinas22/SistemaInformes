/* ══════════════════════════════════════════════════════════════════
   ET35 · Exportación PDF (jsPDF local, sin CDN)
   Sólo recibe los campos que el servidor autorizó para el usuario.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const NEGRO = [27, 27, 25];
  const ROJO_PROFUNDO = [42, 9, 5];
  const RED = [225, 48, 30];
  const GRAY = [90, 96, 105];
  const LIGHT = [247, 247, 244];

  const FIELD_LABELS = {
    reason: 'Motivo',
    description: 'Descripción del hecho',
    studentText: 'Descargo del alumno/a',
    severity: 'Clasificación de la falta',
    preceptorNotes: 'Observaciones de preceptoría',
    patNotes: 'Informe PAT / Consejo de Aula',
    councilNotes: 'Informe del Consejo de Convivencia',
    additionalNotes: 'Aclaraciones de autoridades',
    otherConsiderations: 'Medida pedagógica',
    directorDate: 'Fecha del dictamen'
  };

  const SEVERITY = {
    LEVE: 'Leve',
    GRAVE: 'Grave',
    'MUY GRAVE': 'Muy grave',
    SUSPENSO: 'Advertencia (histórico)'
  };

  const STAGE = {
    descargo: 'Descargo del alumno',
    consejos: 'Consejos e intervención PAT',
    dictamen: 'Dictamen de autoridad',
    notificado: 'Notificado / Resuelto'
  };

  function fmtDate(value) {
    if (!value) return '—';
    const raw = String(value);
    const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-AR');
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const day = date.toLocaleDateString('es-AR');
    const time = date
      .toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      // El espacio antes de a.m./p.m. debe ser indisoluble para que la hora
      // nunca quede partida en dos renglones dentro del PDF.
      .replace(/\s+([ap]\.?\s*m\.?)/i, '\u00A0$1');
    return `${day}\u00A0${time}`;
  }

  function getJsPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('El generador de PDF no está disponible. Recargue la página e intente nuevamente.');
    }
    return window.jspdf.jsPDF;
  }

  function makeWriter(doc, schoolName, subtitle, accent) {
    const M = 14;
    const W = 210;
    const RIGHT = W - M;
    const PAGE_BOTTOM = 276;
    let y = 0;

    function header(first) {
      doc.setFillColor(...(accent || NEGRO));
      doc.rect(0, 0, W, first ? 24 : 17, 'F');
      doc.setFillColor(...RED);
      doc.rect(0, 0, W, 2.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(first ? 12 : 9);
      doc.text('ESCUELA TÉCNICA N° 35 D.E. 18', M, first ? 9 : 7.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(first ? 7.8 : 6.8);
      doc.text('Ing. Eduardo Latzina', M, first ? 15 : 11.8);
      doc.setFontSize(first ? 8 : 6.8);
      doc.text(schoolName || 'Sistema de Informes de Convivencia', M, first ? 20.5 : 15.5);
      if (first) {
        doc.setFontSize(6.8);
        doc.text('Documento institucional · Datos personales protegidos', RIGHT, 20.5, { align: 'right' });
      }
      if (subtitle) {
        doc.setFontSize(first ? 8 : 6.8);
        doc.text(subtitle, RIGHT, first ? 15 : 11.8, { align: 'right' });
      }
      y = first ? 28 : 22;
    }

    function ensure(height) {
      if (y + height > PAGE_BOTTOM) {
        doc.addPage();
        header(false);
      }
    }

    function section(title) {
      ensure(12);
      y += 3;
      doc.setDrawColor(...NEGRO);
      doc.setLineWidth(0.4);
      doc.line(M, y, M + 4, y);
      doc.setTextColor(...ROJO_PROFUNDO);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(title.toUpperCase(), M + 6, y + 1);
      y += 7;
    }

    /** Dibuja texto con salto de línea. x/ancho opcionales para dos columnas. */
    function block(text, x = M, width = RIGHT - M, fontSize = 8, lineHeight = 4) {
      if (text === undefined || text === null || text === '') return 0;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(38, 43, 49);
      const lines = doc.splitTextToSize(String(text), width);
      const start = y;
      for (const line of lines) {
        ensure(lineHeight);
        doc.text(line, x, y);
        y += lineHeight;
      }
      return y - start;
    }

    /** Etiqueta + valor en el mismo renglón cuando es corto; dos renglones si no. */
    function labelValue(label, value, x = M, width = RIGHT - M) {
      if (value === undefined || value === null || value === '') return;
      ensure(8);
      doc.setTextColor(...GRAY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6);
      doc.text(String(label).toUpperCase(), x, y);
      doc.setTextColor(38, 43, 49);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const labelWidth = doc.getTextWidth(`${String(label).toUpperCase()}  `);
      const lines = doc.splitTextToSize(String(value), width - labelWidth);
      if (lines.length === 1) {
        doc.text(lines[0], x + labelWidth, y);
        y += 4.6;
      } else {
        y += 3.6;
        for (const line of lines) {
          ensure(4);
          doc.text(line, x, y);
          y += 4;
        }
      }
      y += 1.8;
    }

    function small(text, color = GRAY, fontSize = 7, lineHeight = 3.6) {
      if (text === undefined || text === null || text === '') return;
      ensure(5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(String(text), RIGHT - M);
      for (const line of lines) {
        ensure(lineHeight);
        doc.text(line, M, y);
        y += lineHeight;
      }
    }

    /** Historial en una sola línea por evento para conservar una sola página. */
    function historyLine(item) {
      let text = `${fmtDateTime(item.createdAt)} · ${item.action} · ${item.actorName || 'Sistema'}`
        + (item.description ? ` — ${String(item.description).replace(/\s+/g, ' ')}` : '');
      const maxChars = 118;
      if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
      small(text, GRAY, 6.6, 3.2);
    }

    function divider() {
      ensure(3);
      doc.setDrawColor(220, 220, 214);
      doc.setLineWidth(0.3);
      doc.line(M, y, RIGHT, y);
      y += 3;
    }

    function footer(text) {
      const total = doc.getNumberOfPages();
      for (let page = 1; page <= total; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(225, 224, 217);
        doc.line(M, 285, RIGHT, 285);
        doc.setTextColor(...GRAY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.text(text, M, 290);
        doc.text(`Página ${page} de ${total}`, RIGHT, 290, { align: 'right' });
      }
    }

    return {
      doc, M, W, RIGHT, PAGE_BOTTOM, ensure, header, section, labelValue, block, small, historyLine,
      divider, footer,
      get y() { return y; },
      set y(value) { y = value; }
    };
  }

  function statusText(report) {
    const status = report.status === 'Resuelto' ? 'RESUELTO' : (report.status === 'Anulado' ? 'ANULADO' : 'PENDIENTE');
    return status;
  }

  function report(data, options = {}) {
    const JsPDF = getJsPDF();
    const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const writer = makeWriter(
      doc,
      options.schoolName || 'Escuela Técnica N° 35 D.E. 18',
      `Informe N° ${data.id}`,
      data.status === 'Anulado' ? [120, 45, 38] : NEGRO
    );
    writer.header(true);

    const s = data.student || {};
    const staff = Boolean(options.staff);

    doc.setFillColor(...LIGHT);
    doc.roundedRect(writer.M, writer.y, writer.RIGHT - writer.M, 18, 2, 2, 'F');
    doc.setTextColor(...ROJO_PROFUNDO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(s.name || 'Alumno/a', writer.M + 4, writer.y + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...GRAY);
    doc.text(`DNI ${s.dni || '—'}   ·   Legajo ${s.legajo || '—'}   ·   ${s.course || 'Curso no informado'}`, writer.M + 4, writer.y + 10);
    doc.text(`Estado: ${statusText(data)}   ·   Etapa: ${STAGE[data.stage] || data.stage || '—'}`, writer.M + 4, writer.y + 14.5);
    writer.y += 21;

    // Datos principales en dos columnas para ahorrar altura sin quitar campos.
    const colWidth = (writer.RIGHT - writer.M - 6) / 2;
    const rightX = writer.M + colWidth + 6;
    const dataTop = writer.y;
    writer.section('Datos del informe');
    const dataAfterSection = writer.y;
    writer.labelValue('Fecha de emisión', fmtDate(data.issueDate), writer.M, colWidth);
    writer.labelValue('Informe emitido por', `${data.issuer?.name || '—'}${data.issuer?.role ? ` · ${data.issuer.role}` : ''}`, writer.M, colWidth);
    const leftBottom = writer.y;
    writer.y = dataAfterSection;
    if (data.statementDeadline) writer.labelValue('Plazo de descargo', fmtDate(data.statementDeadline), rightX, colWidth);
    if (data.statementSubmittedAt) writer.labelValue('Descargo presentado', fmtDateTime(data.statementSubmittedAt), rightX, colWidth);
    writer.y = Math.max(leftBottom, writer.y, dataTop + 10);

    if (data.reason || data.description) {
      writer.section('Hecho informado');
      if (data.reason) writer.labelValue(FIELD_LABELS.reason, data.reason);
      if (data.description) writer.labelValue(FIELD_LABELS.description, data.description);
    }

    if (data.studentText) {
      writer.section('Descargo del alumno/a');
      writer.labelValue('Manifestación del alumno/a', data.studentText);
    }

    if (data.severity || data.otherConsiderations || data.directorDate) {
      writer.section('Clasificación y medida');
      if (data.severity) writer.labelValue(FIELD_LABELS.severity, SEVERITY[data.severity] || data.severity);
      if (data.otherConsiderations) writer.labelValue(FIELD_LABELS.otherConsiderations, data.otherConsiderations);
      if (data.directorDate) writer.labelValue(FIELD_LABELS.directorDate, fmtDate(data.directorDate));
    }

    if (staff && (data.preceptorNotes || data.patNotes || data.councilNotes || data.additionalNotes)) {
      writer.section('Intervenciones institucionales');
      if (Array.isArray(data.patTeachers) && data.patTeachers.length) {
        writer.small(`Función PAT / Consejo de Aula: ${data.patTeachers.join(', ')}`);
      }
      if (data.preceptorNotes || data.patNotes) {
        const top = writer.y;
        writer.labelValue(FIELD_LABELS.preceptorNotes, data.preceptorNotes, writer.M, colWidth);
        const leftBottom = writer.y;
        writer.y = top;
        writer.labelValue(FIELD_LABELS.patNotes, data.patNotes, rightX, colWidth);
        writer.y = Math.max(leftBottom, writer.y);
      }
      if (data.councilNotes || data.additionalNotes) {
        const top = writer.y;
        writer.labelValue(FIELD_LABELS.councilNotes, data.councilNotes, writer.M, colWidth);
        const leftBottom = writer.y;
        writer.y = top;
        writer.labelValue(FIELD_LABELS.additionalNotes, data.additionalNotes, rightX, colWidth);
        writer.y = Math.max(leftBottom, writer.y);
      }
    }

    if (staff && (data.notifyStudent || data.notifyParent)) {
      const deliveryLabels = {
        notificado: { student: 'notificado/a', parent: 'notificada' },
        en_proceso: { student: 'en proceso', parent: 'en proceso' },
        error: { student: 'Error de envío', parent: 'Error de envío' }
      };
      const statusOf = (key) => {
        const status = data.notifications?.[key] || 'en_proceso';
        return (deliveryLabels[status] || deliveryLabels.en_proceso)[key];
      };
      writer.small(`Notificaciones por correo: alumno/a ${statusOf('student')} · familia ${statusOf('parent')}`);
      writer.y += 1.5;
    }

    if (staff && Array.isArray(data.history) && data.history.length) {
      writer.section('Historial del informe');
      // Se reserva la firma y se recorta el historial para no pasar de página.
      const room = writer.PAGE_BOTTOM - writer.y - 22;
      const maxItems = Math.max(0, Math.floor(room / 3.4));
      const shown = data.history.slice(0, maxItems);
      shown.forEach(item => writer.historyLine(item));
      if (shown.length < data.history.length) {
        writer.small(`Se omiten ${data.history.length - shown.length} evento(s) por espacio. El historial completo está disponible en el sistema.`);
      }
    }

    // Firma: se reserva espacio real antes de seguir escribiendo para evitar
    // que quede sola en una segunda página cuando el historial es extenso.
    const signatureHeight = 18;
    writer.ensure(signatureHeight + 6);
    const signatureTop = writer.y + 8;

    if (data.directorSignatureImage) {
      try {
        const image = doc.getImageProperties(data.directorSignatureImage);
        const maxWidth = 50;
        const maxHeight = 14;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = writer.RIGHT - 60 + (60 - width) / 2;
        const y = signatureTop - height - 1;
        doc.addImage(data.directorSignatureImage, 'PNG', x, y, width, height, undefined, 'FAST');
      } catch (_) {
        // Si el navegador no puede interpretar la firma, el PDF se genera
        // igualmente con la línea de firma vacía.
      }
    }

    doc.setDrawColor(160, 160, 152);
    doc.setLineWidth(0.3);
    doc.line(writer.M, signatureTop, writer.M + 60, signatureTop);
    doc.line(writer.RIGHT - 60, signatureTop, writer.RIGHT, signatureTop);
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text('Firma del emisor / preceptoría', writer.M, signatureTop + 4);
    doc.text('Dirección / autoridad competente', writer.RIGHT - 60, signatureTop + 4);

    writer.footer(`Informe de convivencia N° ${data.id} · Generado el ${fmtDateTime(new Date())}`);
    doc.save(`informe-convivencia-${data.id}.pdf`);
  }

  function studentHistory(student, reports, options = {}) {
    const JsPDF = getJsPDF();
    const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const writer = makeWriter(
      doc,
      options.schoolName || 'Escuela Técnica N° 35 D.E. 18',
      'Legajo de convivencia',
      NEGRO
    );
    writer.header(true);

    writer.section('Alumno/a');
    writer.labelValue('Nombre', student.name);
    writer.labelValue('DNI', student.dni);
    writer.labelValue('Legajo', student.legajo || '—');
    writer.labelValue('Curso', student.course);
    if (student.birthDate) writer.labelValue('Fecha de nacimiento', fmtDate(student.birthDate));

    const total = reports.length;
    const pending = reports.filter(r => r.status === 'Pendiente').length;
    const resolved = reports.filter(r => r.status === 'Resuelto').length;
    const annulled = reports.filter(r => r.status === 'Anulado').length;
    writer.section('Resumen');
    writer.small(`Total: ${total} · Pendientes: ${pending} · Resueltos: ${resolved} · Anulados: ${annulled}`);

    writer.section('Informes registrados');
    if (!reports.length) {
      writer.small('Sin informes registrados.');
    } else {
      reports.forEach((item, index) => {
        writer.ensure(18);
        if (index > 0) writer.divider();
        doc.setTextColor(...ROJO_PROFUNDO);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`Informe N° ${item.id} · ${fmtDate(item.issueDate)}`, writer.M, writer.y);
        writer.y += 4.4;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.6);
        doc.setTextColor(...GRAY);
        doc.text(`${item.status} · ${STAGE[item.stage] || item.stage || '—'}${item.severity ? ` · ${SEVERITY[item.severity] || item.severity}` : ''}`, writer.M, writer.y);
        writer.y += 4.2;
        if (item.reason) writer.small(`Motivo: ${item.reason}`, [50, 55, 60], 7.6, 3.5);
        if (item.description) writer.small(item.description, [75, 80, 86], 7.4, 3.4);
        if (item.issuer?.name) writer.small(`Emitido por: ${item.issuer.name}`, GRAY, 7.4, 3.4);
      });
    }

    writer.footer(`Legajo de convivencia · ${student.name} · Generado el ${fmtDateTime(new Date())}`);
    doc.save(`legajo-convivencia-${student.dni || student.id}.pdf`);
  }

  window.ET35 = window.ET35 || {};
  window.ET35.pdf = { report, studentHistory };
})();
