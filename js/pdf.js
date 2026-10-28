/* ══════════════════════════════════════════════════════════════════
   ET35 · Exportación PDF (jsPDF local, sin CDN)
   Sólo recibe los campos que el servidor autorizó para el usuario.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const NAVY = [33, 82, 136];
  const NAVY_DARK = [23, 60, 99];
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
    SUSPENSO: 'Suspenso'
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
    return Number.isNaN(date.getTime())
      ? '—'
      : `${date.toLocaleDateString('es-AR')} ${date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function getJsPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('El generador de PDF no está disponible. Recargue la página e intente nuevamente.');
    }
    return window.jspdf.jsPDF;
  }

  function makeWriter(doc, schoolName, subtitle, accent) {
    const M = 16;
    const W = 210;
    const RIGHT = W - M;
    let y = 0;

    function header(first) {
      doc.setFillColor(...(accent || NAVY));
      doc.rect(0, 0, W, first ? 32 : 20, 'F');
      doc.setFillColor(...RED);
      doc.rect(0, 0, W, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(first ? 14 : 10);
      doc.text('ESCUELA TÉCNICA N° 35 D.E. 18', M, first ? 13 : 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(first ? 8.8 : 7.5);
      doc.text('Ing. Eduardo Latzina', M, first ? 19 : 13.5);
      doc.setFontSize(first ? 10 : 8);
      doc.text(schoolName || 'Sistema de Informes de Convivencia', M, first ? 26 : 17.5);
      if (first) {
        doc.setFontSize(8);
        doc.text('Documento institucional · Datos personales protegidos', RIGHT, 26, { align: 'right' });
      }
      if (subtitle) {
        doc.setFontSize(first ? 9 : 7);
        doc.text(subtitle, RIGHT, first ? 20 : 13.5, { align: 'right' });
      }
      y = first ? 40 : 28;
    }

    function ensure(height) {
      if (y + height > 280) {
        doc.addPage();
        header(false);
      }
    }

    function section(title) {
      ensure(15);
      y += 2;
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.5);
      doc.line(M, y, M + 4, y);
      doc.setTextColor(...NAVY_DARK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(title.toUpperCase(), M + 6, y + 1.5);
      y += 7;
    }

    function labelValue(label, value) {
      if (value === undefined || value === null || value === '') return;
      ensure(14);
      doc.setTextColor(...GRAY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(String(label).toUpperCase(), M, y);
      y += 4.5;
      doc.setTextColor(38, 43, 49);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      const lines = doc.splitTextToSize(String(value), RIGHT - M);
      for (const line of lines) {
        ensure(6);
        doc.text(line, M, y);
        y += 4.8;
      }
      y += 2.8;
    }

    function small(text, color = GRAY) {
      ensure(7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(String(text), RIGHT - M);
      for (const line of lines) {
        ensure(5);
        doc.text(line, M, y);
        y += 4.2;
      }
    }

    function divider() {
      ensure(5);
      doc.setDrawColor(220, 220, 214);
      doc.setLineWidth(0.3);
      doc.line(M, y, RIGHT, y);
      y += 5;
    }

    function footer(text) {
      const total = doc.getNumberOfPages();
      for (let page = 1; page <= total; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(225, 224, 217);
        doc.line(M, 288, RIGHT, 288);
        doc.setTextColor(...GRAY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(text, M, 293);
        doc.text(`Página ${page} de ${total}`, RIGHT, 293, { align: 'right' });
      }
    }

    return {
      doc, M, W, RIGHT, ensure, header, section, labelValue, small, divider, footer,
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
      data.status === 'Anulado' ? [120, 45, 38] : NAVY
    );
    writer.header(true);

    const s = data.student || {};
    const staff = Boolean(options.staff);

    doc.setFillColor(...LIGHT);
    doc.roundedRect(writer.M, writer.y, writer.RIGHT - writer.M, 24, 2, 2, 'F');
    doc.setTextColor(...NAVY_DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(s.name || 'Alumno/a', writer.M + 5, writer.y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text(`DNI ${s.dni || '—'}   ·   Legajo ${s.legajo || '—'}   ·   ${s.course || 'Curso no informado'}`, writer.M + 5, writer.y + 14.5);
    doc.text(`Estado: ${statusText(data)}   ·   Etapa: ${STAGE[data.stage] || data.stage || '—'}`, writer.M + 5, writer.y + 20);
    writer.y += 31;

    writer.section('Datos del informe');
    writer.labelValue('Fecha de emisión', fmtDate(data.issueDate));
    writer.labelValue('Informe emitido por', `${data.issuer?.name || '—'}${data.issuer?.role ? ` · ${data.issuer.role}` : ''}`);
    if (data.statementDeadline) writer.labelValue('Plazo de descargo', fmtDate(data.statementDeadline));
    if (data.statementSubmittedAt) writer.labelValue('Descargo presentado', fmtDateTime(data.statementSubmittedAt));

    if (data.reason || data.description) {
      writer.section('Hecho informado');
      writer.labelValue(FIELD_LABELS.reason, data.reason);
      writer.labelValue(FIELD_LABELS.description, data.description);
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
      writer.labelValue(FIELD_LABELS.preceptorNotes, data.preceptorNotes);
      writer.labelValue(FIELD_LABELS.patNotes, data.patNotes);
      writer.labelValue(FIELD_LABELS.councilNotes, data.councilNotes);
      writer.labelValue(FIELD_LABELS.additionalNotes, data.additionalNotes);
    }

    if (staff && (data.notifyStudent || data.notifyParent)) {
      writer.section('Notificaciones');
      writer.small(`Alumno/a: ${data.notifyStudent ? 'notificado' : 'sin notificar'} · Familia: ${data.notifyParent ? 'notificada' : 'sin notificar'}`);
    }

    if (staff && Array.isArray(data.history) && data.history.length) {
      writer.section('Historial del informe');
      data.history.forEach(item => {
        writer.small(`${fmtDateTime(item.createdAt)} · ${item.action} · ${item.actorName || 'Sistema'}`);
        if (item.description) writer.small(`   ${item.description}`);
      });
    }

    writer.y += 8;
    writer.ensure(45);
    const signatureTop = writer.y + 12;

    if (data.directorSignatureImage) {
      try {
        const image = doc.getImageProperties(data.directorSignatureImage);
        const maxWidth = 55;
        const maxHeight = 22;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = writer.RIGHT - 62 + (62 - width) / 2;
        const y = signatureTop - height - 1;
        doc.addImage(data.directorSignatureImage, 'PNG', x, y, width, height, undefined, 'FAST');
      } catch (_) {
        // Si el navegador no puede interpretar la firma, el PDF se genera
        // igualmente con la línea de firma vacía.
      }
    }

    doc.setDrawColor(160, 160, 152);
    doc.line(writer.M, signatureTop, writer.M + 62, signatureTop);
    doc.line(writer.RIGHT - 62, signatureTop, writer.RIGHT, signatureTop);
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text('Firma del emisor / preceptoría', writer.M, signatureTop + 5);
    doc.text('Dirección / autoridad competente', writer.RIGHT - 62, signatureTop + 5);

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
      NAVY
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
    writer.small(`Total de informes: ${total} · Pendientes: ${pending} · Resueltos: ${resolved} · Anulados: ${annulled}`);

    writer.section('Informes registrados');
    if (!reports.length) {
      writer.small('Sin informes registrados.');
    } else {
      reports.forEach((item, index) => {
        writer.ensure(34);
        if (index > 0) writer.divider();
        doc.setTextColor(...NAVY_DARK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text(`Informe N° ${item.id} · ${fmtDate(item.issueDate)}`, writer.M, writer.y);
        writer.y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...GRAY);
        doc.text(`${item.status} · ${STAGE[item.stage] || item.stage || '—'}${item.severity ? ` · ${SEVERITY[item.severity] || item.severity}` : ''}`, writer.M, writer.y);
        writer.y += 4.6;
        if (item.reason) writer.small(`Motivo: ${item.reason}`, [50, 55, 60]);
        if (item.description) writer.small(item.description, [75, 80, 86]);
        if (item.issuer?.name) writer.small(`Emitido por: ${item.issuer.name}`, GRAY);
      });
    }

    writer.footer(`Legajo de convivencia · ${student.name} · Generado el ${fmtDateTime(new Date())}`);
    doc.save(`legajo-convivencia-${student.dni || student.id}.pdf`);
  }

  window.ET35 = window.ET35 || {};
  window.ET35.pdf = { report, studentHistory };
})();
