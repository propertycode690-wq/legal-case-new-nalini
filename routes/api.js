const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const db = require('../config/db')

const DATA_DIR = path.join(__dirname, '..', 'data')
const UPLOADS_DOCS_DIR = path.join(__dirname, '..', 'uploads', 'documents')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
ensureDir(DATA_DIR)
ensureDir(UPLOADS_DOCS_DIR)

function readJsonFile(filePath, defaultVal = []) {
  try {
    if (!fs.existsSync(filePath)) return defaultVal
    const content = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(content || '[]')
  } catch (e) {
    return defaultVal
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.error(`Error writing to ${filePath}:`, e)
  }
}

// Helper function to execute query
async function query(sql, params = []) {
  const [rows] = await db.query(sql, params)
  return rows
}

// =====================================================================
// 1. CLIENT MASTER APIS
// =====================================================================
router.get('/clients', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM ClientMaster ORDER BY ID DESC')
    const clients = rows.map((r) => ({
      id: String(r.ID),
      name: r.ClientName || '',
      relation: r.So || '',
      address: r.Address || '',
      phone: r.PhoneNo || '',
      extraPhone: '',
      referenceName: r.RefName || '',
      referencePhone: r.RefPhNo || '',
      fees: Number(r.ConFees || 0),
      date: r.ClientDate || '',
      createdAt: r.created_at,
    }))
    res.json(clients)
  } catch (err) {
    console.error('Error fetching clients:', err)
    res.status(500).json({ error: 'Failed to fetch clients' })
  }
})

router.post('/clients', async (req, res) => {
  try {
    const { name, relation, address, phone, referenceName, referencePhone, fees, date } = req.body
    const result = await query(
      'INSERT INTO ClientMaster (ClientName, So, Address, PhoneNo, RefName, RefPhNo, ConFees, ClientDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name || '', relation || '', address || '', phone || '', referenceName || '', referencePhone || '', Number(fees || 0), date || '']
    )
    const newClient = {
      id: String(result.insertId),
      name: name || '',
      relation: relation || '',
      address: address || '',
      phone: phone || '',
      referenceName: referenceName || '',
      referencePhone: referencePhone || '',
      fees: Number(fees || 0),
      date: date || '',
    }
    res.status(201).json(newClient)
  } catch (err) {
    console.error('Error creating client:', err)
    res.status(500).json({ error: 'Failed to create client' })
  }
})

router.put('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, relation, address, phone, referenceName, referencePhone, fees, date } = req.body
    await query(
      'UPDATE ClientMaster SET ClientName = ?, So = ?, Address = ?, PhoneNo = ?, RefName = ?, RefPhNo = ?, ConFees = ?, ClientDate = ? WHERE ID = ?',
      [name || '', relation || '', address || '', phone || '', referenceName || '', referencePhone || '', Number(fees || 0), date || '', id]
    )
    res.json({ id, name, relation, address, phone, referenceName, referencePhone, fees: Number(fees || 0), date })
  } catch (err) {
    console.error('Error updating client:', err)
    res.status(500).json({ error: 'Failed to update client' })
  }
})

router.delete('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params
    await query('DELETE FROM ClientMaster WHERE ID = ?', [id])
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting client:', err)
    res.status(500).json({ error: 'Failed to delete client' })
  }
})

// =====================================================================
// 2. CASE MASTER APIS
// =====================================================================
router.get('/cases', async (req, res) => {
  try {
    const sql = `
      SELECT c.*, cl.ClientName, cl.PhoneNo as ClientPhone,
        (SELECT NextDate FROM CaseNext cn WHERE cn.CaseId = c.ID ORDER BY cn.ID DESC LIMIT 1) as NextDate,
        (SELECT cn.For FROM CaseNext cn WHERE cn.CaseId = c.ID ORDER BY cn.ID DESC LIMIT 1) as NextFor,
        (SELECT cn.CourtName FROM CaseNext cn WHERE cn.CaseId = c.ID ORDER BY cn.ID DESC LIMIT 1) as NextCourt
      FROM CaseMaster c
      LEFT JOIN ClientMaster cl ON c.ClientId = cl.ID
      ORDER BY c.ID DESC
    `
    const rows = await query(sql)
    const cases = rows.map((r) => ({
      id: String(r.ID),
      clientId: r.ClientId ? String(r.ClientId) : '',
      clientName: r.ClientName || '',
      phone: r.ClientPhone || '',
      caseNo: r.CaseNo || '',
      psCaseNo: r.PsCaseNo || '',
      courtName: r.CourtName || '',
      startDate: r.StartDate || '',
      ppName: r.PPName || '',
      psCaseDate: r.PsCaseDate || '',
      rackNo: r.RackNo || '',
      roomNo: r.RoomNo || '',
      underSection: r.Us || '',
      caseFor: r.For || '',
      lcName: r.LcName || '',
      versusName: r.VersusName || '',
      adAdvName: r.AdAdvName || '',
      caseDetails: r.CaseDetails || '',
      nextDate: r.NextDate || '',
      nextFor: r.NextFor || '',
      nextCourt: r.NextCourt || '',
    }))
    res.json(cases)
  } catch (err) {
    console.error('Error fetching cases:', err)
    res.status(500).json({ error: 'Failed to fetch cases' })
  }
})

router.post('/cases/bulk', async (req, res) => {
  try {
    const cases = req.body
    if (!Array.isArray(cases) || cases.length === 0) {
      return res.status(400).json({ error: 'Expected non-empty array of cases' })
    }

    let insertedCount = 0
    for (const c of cases) {
      const parsedClientId = c.clientId ? parseInt(String(c.clientId).replace(/\D/g, ''), 10) || null : null
      const result = await query(
        `INSERT INTO CaseMaster 
        (ClientId, CaseNo, PsCaseNo, CourtName, StartDate, PPName, PsCaseDate, RackNo, RoomNo, Us, \`For\`, LcName, VersusName, AdAdvName, CaseDetails) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parsedClientId, c.caseNo || '', c.psCaseNo || '', c.courtName || '', c.startDate || '',
          c.ppName || '', c.psCaseDate || '', c.rackNo || '', c.roomNo || '', c.underSection || c.us || '',
          c.caseFor || c.for || c.purpose || '', c.lcName || c.lc || '', c.versusName || c.vsName || '', c.adAdvName || '', c.caseDetails || c.notes || ''
        ]
      )
      const caseId = result.insertId
      if (c.nextDate) {
        await query(
          `INSERT INTO CaseNext (CaseId, NextDate, \`For\`, CourtName, PPName) VALUES (?, ?, ?, ?, ?)`,
          [caseId, c.nextDate, c.nextFor || c.caseFor || c.purpose || '', c.courtName || '', c.ppName || '']
        )
      }
      insertedCount++
    }

    res.status(201).json({ success: true, count: insertedCount })
  } catch (err) {
    console.error('Bulk case import error:', err)
    res.status(500).json({ error: 'Failed to bulk import cases' })
  }
})

router.post('/cases', async (req, res) => {
  try {
    const {
      clientId, caseNo, psCaseNo, courtName, startDate, ppName, psCaseDate,
      rackNo, roomNo, underSection, caseFor, lcName, versusName, adAdvName,
      caseDetails, nextDate, nextFor
    } = req.body

    const parsedClientId = clientId ? parseInt(String(clientId).replace(/\D/g, ''), 10) || null : null

    const result = await query(
      `INSERT INTO CaseMaster 
      (ClientId, CaseNo, PsCaseNo, CourtName, StartDate, PPName, PsCaseDate, RackNo, RoomNo, Us, \`For\`, LcName, VersusName, AdAdvName, CaseDetails) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parsedClientId, caseNo || '', psCaseNo || '', courtName || '', startDate || '',
        ppName || '', psCaseDate || '', rackNo || '', roomNo || '', underSection || '',
        caseFor || '', lcName || '', versusName || '', adAdvName || '', caseDetails || ''
      ]
    )

    const caseId = result.insertId

    // Insert initial next date in CaseNext if provided
    if (nextDate) {
      await query(
        `INSERT INTO CaseNext (CaseId, NextDate, \`For\`, CourtName, PPName) VALUES (?, ?, ?, ?, ?)`,
        [caseId, nextDate, nextFor || caseFor || '', courtName || '', ppName || '']
      )
    }

    res.status(201).json({
      id: String(caseId),
      clientId: parsedClientId ? String(parsedClientId) : '',
      caseNo,
      psCaseNo,
      courtName,
      startDate,
      ppName,
      psCaseDate,
      rackNo,
      roomNo,
      underSection,
      caseFor,
      lcName,
      versusName,
      adAdvName,
      caseDetails,
      nextDate: nextDate || '',
      nextFor: nextFor || '',
    })
  } catch (err) {
    console.error('Error creating case:', err)
    res.status(500).json({ error: 'Failed to create case' })
  }
})

router.put('/cases/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [existing] = await query('SELECT * FROM CaseMaster WHERE ID = ?', [id])
    if (!existing) {
      return res.status(404).json({ error: 'Case not found' })
    }

    const clientIdVal = req.body.clientId !== undefined
      ? (req.body.clientId ? parseInt(String(req.body.clientId).replace(/\D/g, ''), 10) || null : null)
      : existing.ClientId

    const caseNoVal = req.body.caseNo !== undefined ? req.body.caseNo : existing.CaseNo
    const psCaseNoVal = req.body.psCaseNo !== undefined ? req.body.psCaseNo : (req.body.otherCaseNumber !== undefined ? req.body.otherCaseNumber : existing.PsCaseNo)
    const courtNameVal = req.body.courtName !== undefined ? req.body.courtName : existing.CourtName
    const startDateVal = req.body.startDate !== undefined ? req.body.startDate : existing.StartDate
    const ppNameVal = req.body.ppName !== undefined ? req.body.ppName : existing.PPName
    const psCaseDateVal = req.body.psCaseDate !== undefined ? req.body.psCaseDate : existing.PsCaseDate
    const rackNoVal = req.body.rackNo !== undefined ? req.body.rackNo : existing.RackNo
    const roomNoVal = req.body.roomNo !== undefined ? req.body.roomNo : existing.RoomNo
    const underSectionVal = req.body.underSection !== undefined ? req.body.underSection : (req.body.us !== undefined ? req.body.us : existing.Us)
    const forVal = req.body.caseFor !== undefined ? req.body.caseFor : (req.body.purpose !== undefined ? req.body.purpose : (req.body.for !== undefined ? req.body.for : existing.For))
    const lcNameVal = req.body.lcName !== undefined ? req.body.lcName : (req.body.lc !== undefined ? req.body.lc : existing.LcName)
    const versusNameVal = req.body.versusName !== undefined ? req.body.versusName : (req.body.vsName !== undefined ? req.body.vsName : existing.VersusName)
    const adAdvNameVal = req.body.adAdvName !== undefined ? req.body.adAdvName : existing.AdAdvName
    const caseDetailsVal = req.body.caseDetails !== undefined ? req.body.caseDetails : (req.body.notes !== undefined ? req.body.notes : existing.CaseDetails)

    await query(
      `UPDATE CaseMaster SET 
      ClientId = ?, CaseNo = ?, PsCaseNo = ?, CourtName = ?, StartDate = ?, PPName = ?, 
      PsCaseDate = ?, RackNo = ?, RoomNo = ?, Us = ?, \`For\` = ?, LcName = ?, 
      VersusName = ?, AdAdvName = ?, CaseDetails = ?
      WHERE ID = ?`,
      [
        clientIdVal, caseNoVal || '', psCaseNoVal || '', courtNameVal || '', startDateVal || '',
        ppNameVal || '', psCaseDateVal || '', rackNoVal || '', roomNoVal || '', underSectionVal || '',
        forVal || '', lcNameVal || '', versusNameVal || '', adAdvNameVal || '', caseDetailsVal || '',
        id
      ]
    )

    const nextDateVal = req.body.nextDate
    const nextForVal = req.body.nextFor || req.body.purpose || req.body.caseFor || req.body.for || forVal
    if (nextDateVal) {
      await query(
        `INSERT INTO CaseNext (CaseId, NextDate, \`For\`, CourtName, PPName) VALUES (?, ?, ?, ?, ?)`,
        [id, nextDateVal, nextForVal || '', courtNameVal || '', ppNameVal || '']
      )
    }

    res.json({
      id: String(id),
      clientId: clientIdVal ? String(clientIdVal) : '',
      caseNo: caseNoVal,
      psCaseNo: psCaseNoVal,
      courtName: courtNameVal,
      startDate: startDateVal,
      ppName: ppNameVal,
      psCaseDate: psCaseDateVal,
      rackNo: rackNoVal,
      roomNo: roomNoVal,
      underSection: underSectionVal,
      caseFor: forVal,
      lcName: lcNameVal,
      versusName: versusNameVal,
      adAdvName: adAdvNameVal,
      caseDetails: caseDetailsVal,
      nextDate: nextDateVal || '',
      nextFor: nextForVal || '',
    })
  } catch (err) {
    console.error('Error updating case:', err)
    res.status(500).json({ error: 'Failed to update case' })
  }
})

router.delete('/cases/:id', async (req, res) => {
  try {
    const { id } = req.params
    await query('DELETE FROM CaseNext WHERE CaseId = ?', [id])
    await query('DELETE FROM CaseMaster WHERE ID = ?', [id])
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting case:', err)
    res.status(500).json({ error: 'Failed to delete case' })
  }
})

// =====================================================================
// 3. CASE NEXT / REMINDERS APIS
// =====================================================================
router.get('/reminders', async (req, res) => {
  try {
    const sql = `
      SELECT cn.*, c.CaseNo, c.VersusName, cl.ClientName, cl.PhoneNo
      FROM CaseNext cn
      LEFT JOIN CaseMaster c ON cn.CaseId = c.ID
      LEFT JOIN ClientMaster cl ON c.ClientId = cl.ID
      ORDER BY cn.NextDate ASC
    `
    const rows = await query(sql)
    const reminders = rows.map((r) => ({
      id: String(r.ID),
      caseId: r.CaseId ? String(r.CaseId) : '',
      caseNo: r.CaseNo || '',
      clientName: r.ClientName || '',
      phone: r.PhoneNo || '',
      nextDate: r.NextDate || '',
      hearingDate: r.NextDate || '',
      date: r.NextDate || '',
      for: r.For || '',
      stage: r.For || '',
      reasons: r.For || '',
      courtName: r.CourtName || '',
      ppName: r.PPName || '',
      otherAc: r.OtherAc || '',
      notes: r.OtherAc || '',
      status: 'Active',
    }))
    res.json(reminders)
  } catch (err) {
    console.error('Error fetching reminders:', err)
    res.status(500).json({ error: 'Failed to fetch reminders' })
  }
})

router.post('/reminders', async (req, res) => {
  try {
    const { caseId, nextDate, hearingDate, date, stage, courtName, ppName, otherAc, notes, reasons, clientName, phone } = req.body
    const dateVal = nextDate || hearingDate || date || ''
    const stageVal = req.body.for || stage || reasons || ''
    const notesVal = otherAc || notes || ''
    let parsedCaseId = caseId ? parseInt(String(caseId).replace(/\D/g, ''), 10) || null : null

    // If caseId is not directly passed but clientName is passed, try to link with client's active case
    if (!parsedCaseId && clientName) {
      const [matchedCase] = await query(
        `SELECT c.ID FROM CaseMaster c 
         LEFT JOIN ClientMaster cl ON c.ClientId = cl.ID 
         WHERE cl.ClientName LIKE ? OR c.CaseNo LIKE ? LIMIT 1`,
        [`%${clientName.trim()}%`, `%${clientName.trim()}%`]
      )
      if (matchedCase) parsedCaseId = matchedCase.ID
    }

    const result = await query(
      `INSERT INTO CaseNext (CaseId, NextDate, \`For\`, CourtName, PPName, OtherAc) VALUES (?, ?, ?, ?, ?, ?)`,
      [parsedCaseId, dateVal, stageVal, courtName || '', ppName || '', notesVal]
    )

    res.status(201).json({
      id: String(result.insertId),
      caseId: parsedCaseId ? String(parsedCaseId) : '',
      clientName: clientName || '',
      phone: phone || '',
      nextDate: dateVal,
      hearingDate: dateVal,
      date: dateVal,
      for: stageVal,
      stage: stageVal,
      reasons: stageVal,
      courtName: courtName || '',
      ppName: ppName || '',
      otherAc: notesVal,
      notes: notesVal,
      status: 'Active',
    })
  } catch (err) {
    console.error('Error saving reminder:', err)
    res.status(500).json({ error: 'Failed to save reminder' })
  }
})

router.put('/reminders/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [existing] = await query('SELECT * FROM CaseNext WHERE ID = ?', [id])
    if (!existing) {
      return res.status(404).json({ error: 'Reminder not found' })
    }

    const dateVal = req.body.nextDate !== undefined ? req.body.nextDate : (req.body.hearingDate !== undefined ? req.body.hearingDate : (req.body.date !== undefined ? req.body.date : existing.NextDate))
    const stageVal = req.body.for !== undefined ? req.body.for : (req.body.stage !== undefined ? req.body.stage : (req.body.reasons !== undefined ? req.body.reasons : existing.For))
    const courtVal = req.body.courtName !== undefined ? req.body.courtName : existing.CourtName
    const ppVal = req.body.ppName !== undefined ? req.body.ppName : existing.PPName
    const notesVal = req.body.otherAc !== undefined ? req.body.otherAc : (req.body.notes !== undefined ? req.body.notes : existing.OtherAc)

    await query(
      'UPDATE CaseNext SET NextDate = ?, `For` = ?, CourtName = ?, PPName = ?, OtherAc = ? WHERE ID = ?',
      [dateVal || '', stageVal || '', courtVal || '', ppVal || '', notesVal || '', id]
    )

    res.json({
      id: String(id),
      caseId: existing.CaseId ? String(existing.CaseId) : '',
      clientName: req.body.clientName || '',
      phone: req.body.phone || '',
      nextDate: dateVal,
      hearingDate: dateVal,
      date: dateVal,
      for: stageVal,
      stage: stageVal,
      reasons: stageVal,
      courtName: courtVal,
      ppName: ppVal,
      otherAc: notesVal,
      notes: notesVal,
      status: 'Active',
    })
  } catch (err) {
    console.error('Error updating reminder:', err)
    res.status(500).json({ error: 'Failed to update reminder' })
  }
})

router.delete('/reminders/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('DELETE FROM CaseNext WHERE ID = ?', [id])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Reminder not found' })
    }
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting reminder:', err)
    res.status(500).json({ error: 'Failed to delete reminder' })
  }
})

// =====================================================================
// 4. BILLING APIS
// =====================================================================
router.get('/bills', async (req, res) => {
  try {
    const sql = `
      SELECT b.*, cl.ClientName
      FROM Billing b
      LEFT JOIN ClientMaster cl ON b.ClientId = cl.ID
      ORDER BY b.ID DESC
    `
    const rows = await query(sql)
    const bills = rows.map((r) => ({
      id: String(r.ID),
      billNumber: `BILL-${r.ID}`,
      billNo: String(r.ID),
      billDate: r.BillingDate ? String(r.BillingDate).split(' ')[0] : '',
      date: r.BillingDate || '',
      billingDate: r.BillingDate || '',
      clientId: r.ClientId ? String(r.ClientId) : '',
      clientName: r.ClientName || '',
      amount: Number(r.Amount || 0),
      totalAmount: Number(r.Amount || 0),
      totalBillAmount: Number(r.Amount || 0),
      contractAmount: Number(r.Amount || 0),
      particulars: r.Details || '',
      details: r.Details || '',
      description: r.Details || '',
    }))
    res.json(bills)
  } catch (err) {
    console.error('Error fetching bills:', err)
    res.status(500).json({ error: 'Failed to fetch bills' })
  }
})

router.post('/bills', async (req, res) => {
  try {
    const { clientId, date, billingDate, amount, totalAmount, particulars, details } = req.body
    const parsedClientId = clientId ? parseInt(String(clientId).replace(/\D/g, ''), 10) || null : null
    const dateVal = billingDate || date || new Date().toISOString().split('T')[0]
    const amountVal = Number(amount || totalAmount || 0)
    const detailsVal = particulars || details || ''

    const result = await query(
      'INSERT INTO Billing (ClientId, BillingDate, Amount, Details) VALUES (?, ?, ?, ?)',
      [parsedClientId, dateVal, amountVal, detailsVal]
    )

    res.status(201).json({
      id: String(result.insertId),
      clientId: parsedClientId ? String(parsedClientId) : '',
      date: dateVal,
      billingDate: dateVal,
      amount: amountVal,
      totalAmount: amountVal,
      particulars: detailsVal,
      details: detailsVal,
    })
  } catch (err) {
    console.error('Error saving bill:', err)
    res.status(500).json({ error: 'Failed to save bill' })
  }
})

router.delete('/bills/:id', async (req, res) => {
  try {
    const { id } = req.params
    await query('DELETE FROM Billing WHERE ID = ?', [id])
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting bill:', err)
    res.status(500).json({ error: 'Failed to delete bill' })
  }
})

// =====================================================================
// 5. PAYMENT APIS
// =====================================================================
router.get('/payments', async (req, res) => {
  try {
    const sql = `
      SELECT p.*, cl.ClientName
      FROM Payment p
      LEFT JOIN ClientMaster cl ON p.ClientId = cl.ID
      ORDER BY p.ID DESC
    `
    const rows = await query(sql)
    const payments = rows.map((r) => ({
      id: String(r.ID),
      receiptNo: `REC-${r.ID}`,
      receiptNumber: `REC-${r.ID}`,
      clientId: r.ClientId ? String(r.ClientId) : '',
      clientName: r.ClientName || '',
      date: r.PaymentDate ? String(r.PaymentDate).split(' ')[0] : '',
      paymentDate: r.PaymentDate ? String(r.PaymentDate).split(' ')[0] : '',
      amount: Number(r.Amount || 0),
      paidAmount: Number(r.Amount || 0),
      remarks: r.Details || '',
      details: r.Details || '',
      paymentMode: r.Details || 'Cash',
    }))
    res.json(payments)
  } catch (err) {
    console.error('Error fetching payments:', err)
    res.status(500).json({ error: 'Failed to fetch payments' })
  }
})

router.post('/payments', async (req, res) => {
  try {
    const { clientId, date, paymentDate, amount, paidAmount, remarks, details } = req.body
    const parsedClientId = clientId ? parseInt(String(clientId).replace(/\D/g, ''), 10) || null : null
    const dateVal = paymentDate || date || new Date().toISOString().split('T')[0]
    const amountVal = Number(amount || paidAmount || 0)
    const detailsVal = remarks || details || ''

    // Duplicate submission prevention: check for identical payment in the last 5 seconds
    if (parsedClientId && amountVal > 0) {
      const existing = await query(
        `SELECT ID, ClientId, PaymentDate, Amount, Details 
         FROM Payment 
         WHERE ClientId = ? AND PaymentDate = ? AND Amount = ? 
           AND created_at >= NOW() - INTERVAL 5 SECOND
         ORDER BY ID DESC LIMIT 1`,
        [parsedClientId, dateVal, amountVal]
      )
      if (existing && existing.length > 0) {
        return res.status(200).json({
          id: String(existing[0].ID),
          clientId: parsedClientId ? String(parsedClientId) : '',
          date: dateVal,
          paymentDate: dateVal,
          amount: amountVal,
          paidAmount: amountVal,
          remarks: detailsVal,
          details: detailsVal,
          duplicatePrevented: true,
        })
      }
    }

    const result = await query(
      'INSERT INTO Payment (ClientId, PaymentDate, Amount, Details) VALUES (?, ?, ?, ?)',
      [parsedClientId, dateVal, amountVal, detailsVal]
    )

    res.status(201).json({
      id: String(result.insertId),
      clientId: parsedClientId ? String(parsedClientId) : '',
      date: dateVal,
      paymentDate: dateVal,
      amount: amountVal,
      paidAmount: amountVal,
      remarks: detailsVal,
      details: detailsVal,
    })
  } catch (err) {
    console.error('Error saving payment:', err)
    res.status(500).json({ error: 'Failed to save payment' })
  }
})

router.put('/payments/:id', async (req, res) => {
  try {
    const { id } = req.params
    const numericId = parseInt(String(id).replace(/\D/g, ''), 10) || id
    const { clientId, date, paymentDate, amount, paidAmount, remarks, details } = req.body

    const updates = []
    const params = []

    if (clientId !== undefined) {
      const parsedClientId = clientId ? parseInt(String(clientId).replace(/\D/g, ''), 10) || null : null
      updates.push('ClientId = ?')
      params.push(parsedClientId)
    }
    if (paymentDate !== undefined || date !== undefined) {
      updates.push('PaymentDate = ?')
      params.push(paymentDate || date)
    }
    if (amount !== undefined || paidAmount !== undefined) {
      updates.push('Amount = ?')
      params.push(Number(amount !== undefined ? amount : paidAmount))
    }
    if (details !== undefined || remarks !== undefined) {
      updates.push('Details = ?')
      params.push(details !== undefined ? details : remarks)
    }

    if (updates.length > 0) {
      params.push(numericId)
      await query(`UPDATE Payment SET ${updates.join(', ')} WHERE ID = ?`, params)
    }

    res.json({ success: true, id: String(numericId) })
  } catch (err) {
    console.error('Error updating payment:', err)
    res.status(500).json({ error: 'Failed to update payment' })
  }
})

router.delete('/payments/:id', async (req, res) => {
  try {
    const { id } = req.params
    const numericId = parseInt(String(id).replace(/\D/g, ''), 10) || id
    await query('DELETE FROM Payment WHERE ID = ?', [numericId])
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting payment:', err)
    res.status(500).json({ error: 'Failed to delete payment' })
  }
})

// =====================================================================
// 6. EXPENSE & EXPENSE HEAD APIS
// =====================================================================
router.get('/expense-heads', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM ExpenseHeadMaster ORDER BY ExpenseHead ASC')
    const heads = rows.map((r) => ({
      id: String(r.ID),
      name: r.ExpenseHead || '',
      expenseHead: r.ExpenseHead || '',
    }))
    res.json(heads)
  } catch (err) {
    console.error('Error fetching expense heads:', err)
    res.status(500).json({ error: 'Failed to fetch expense heads' })
  }
})

router.post('/expense-heads', async (req, res) => {
  try {
    const { name, expenseHead } = req.body
    const headName = (name || expenseHead || '').trim()
    if (!headName) {
      return res.status(400).json({ error: 'Expense head name is required' })
    }
    const result = await query('INSERT INTO ExpenseHeadMaster (ExpenseHead) VALUES (?)', [headName])
    res.status(201).json({
      id: String(result.insertId),
      name: headName,
      expenseHead: headName,
    })
  } catch (err) {
    console.error('Error saving expense head:', err)
    res.status(500).json({ error: 'Failed to save expense head' })
  }
})

router.put('/expense-heads/:id', async (req, res) => {
  try {
    const { id } = req.params
    const headName = (req.body.name || req.body.expenseHead || '').trim()
    if (!headName) {
      return res.status(400).json({ error: 'Expense head name is required' })
    }
    const result = await query('UPDATE ExpenseHeadMaster SET ExpenseHead = ? WHERE ID = ?', [headName, id])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Expense head not found' })
    }
    res.json({ id: String(id), name: headName, expenseHead: headName })
  } catch (err) {
    console.error('Error updating expense head:', err)
    res.status(500).json({ error: 'Failed to update expense head' })
  }
})

router.delete('/expense-heads/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [used] = await query('SELECT COUNT(*) as count FROM Expense WHERE ExpenseId = ?', [id])
    if (used && used.count > 0) {
      return res.status(400).json({ error: 'Cannot delete expense head linked to existing expenses' })
    }
    const result = await query('DELETE FROM ExpenseHeadMaster WHERE ID = ?', [id])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Expense head not found' })
    }
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting expense head:', err)
    res.status(500).json({ error: 'Failed to delete expense head' })
  }
})

router.get('/expenses', async (req, res) => {
  try {
    const sql = `
      SELECT e.*, ehm.ExpenseHead as HeadName
      FROM Expense e
      LEFT JOIN ExpenseHeadMaster ehm ON e.ExpenseId = ehm.ID
      ORDER BY e.ID DESC
    `
    const rows = await query(sql)
    const expenses = rows.map((r) => ({
      id: String(r.ID),
      headId: r.ExpenseId ? String(r.ExpenseId) : '',
      expenseId: r.ExpenseId ? String(r.ExpenseId) : '',
      headName: r.HeadName || '',
      paidTo: r.PaidTo || '',
      date: r.ExpenseDate || '',
      expenseDate: r.ExpenseDate || '',
      amount: Number(r.Amount || 0),
      remarks: r.Details || '',
      details: r.Details || '',
    }))
    res.json(expenses)
  } catch (err) {
    console.error('Error fetching expenses:', err)
    res.status(500).json({ error: 'Failed to fetch expenses' })
  }
})

router.post('/expenses', async (req, res) => {
  try {
    const { headId, expenseId, paidTo, date, expenseDate, amount, remarks, details } = req.body
    const parsedHeadId = (headId || expenseId) ? parseInt(String(headId || expenseId).replace(/\D/g, ''), 10) || null : null
    const dateVal = expenseDate || date || new Date().toISOString().split('T')[0]
    const amountVal = Number(amount || 0)
    const detailsVal = remarks || details || ''

    const result = await query(
      'INSERT INTO Expense (ExpenseId, PaidTo, ExpenseDate, Amount, Details) VALUES (?, ?, ?, ?, ?)',
      [parsedHeadId, paidTo || '', dateVal, amountVal, detailsVal]
    )

    res.status(201).json({
      id: String(result.insertId),
      headId: parsedHeadId ? String(parsedHeadId) : '',
      paidTo: paidTo || '',
      date: dateVal,
      amount: amountVal,
      remarks: detailsVal,
    })
  } catch (err) {
    console.error('Error saving expense:', err)
    res.status(500).json({ error: 'Failed to save expense' })
  }
})

router.put('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { headId, expenseId, paidTo, date, expenseDate, amount, remarks, details } = req.body
    const parsedHeadId = (headId || expenseId) ? parseInt(String(headId || expenseId).replace(/\D/g, ''), 10) || null : null
    const dateVal = expenseDate || date || new Date().toISOString().split('T')[0]
    const amountVal = Number(amount || 0)
    const detailsVal = remarks || details || ''

    const result = await query(
      'UPDATE Expense SET ExpenseId = ?, PaidTo = ?, ExpenseDate = ?, Amount = ?, Details = ? WHERE ID = ?',
      [parsedHeadId, paidTo || '', dateVal, amountVal, detailsVal, id]
    )
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Expense not found' })
    }
    res.json({
      id: String(id),
      headId: parsedHeadId ? String(parsedHeadId) : '',
      paidTo: paidTo || '',
      date: dateVal,
      expenseDate: dateVal,
      amount: amountVal,
      remarks: detailsVal,
      details: detailsVal,
    })
  } catch (err) {
    console.error('Error updating expense:', err)
    res.status(500).json({ error: 'Failed to update expense' })
  }
})

router.delete('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('DELETE FROM Expense WHERE ID = ?', [id])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Expense not found' })
    }
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting expense:', err)
    res.status(500).json({ error: 'Failed to delete expense' })
  }
})

// =====================================================================
// 7. WAITING LIST & CONSULTATION QUEUE APIS (Chamber & TV Display)
// =====================================================================
router.get('/waiting-list', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM WaitingList ORDER BY ID ASC')
    const list = rows.map((r) => ({
      id: String(r.ID),
      name: r.Name || '',
      clientName: r.Name || '',
      status: r.Status === 1 ? 'In Consultation' : r.Status === 2 ? 'Completed' : 'Waiting',
      statusCode: r.Status,
      address: r.Address || '',
      phoneNo: r.PhoneNo || '',
      mobile: r.PhoneNo || '',
      timeSlot: r.TimeSlot || '',
      consultancyType: r.ConsultancyType || 'Conference',
      date: r.QueueDate || '',
      queueDate: r.QueueDate || '',
      createdAt: r.created_at,
    }))
    res.json(list)
  } catch (err) {
    console.error('Error fetching waiting list:', err)
    res.status(500).json({ error: 'Failed to fetch waiting list' })
  }
})

router.post('/waiting-list', async (req, res) => {
  try {
    const { name, clientName, status, address, phoneNo, mobile, timeSlot, consultancyType, date, queueDate } = req.body
    const nameVal = (name || clientName || '').trim()
    const phoneVal = phoneNo || mobile || ''
    const dateVal = queueDate || date || new Date().toISOString().split('T')[0]
    const typeVal = consultancyType || 'Conference'
    const statusVal = status === 'In Consultation' ? 1 : status === 'Completed' ? 2 : 0

    const result = await query(
      'INSERT INTO WaitingList (Name, Status, Address, PhoneNo, TimeSlot, ConsultancyType, QueueDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nameVal, statusVal, address || '', phoneVal, timeSlot || '', typeVal, dateVal]
    )

    res.status(201).json({
      id: String(result.insertId),
      name: nameVal,
      clientName: nameVal,
      status: statusVal === 1 ? 'In Consultation' : statusVal === 2 ? 'Completed' : 'Waiting',
      statusCode: statusVal,
      address: address || '',
      phoneNo: phoneVal,
      mobile: phoneVal,
      timeSlot: timeSlot || '',
      consultancyType: typeVal,
      date: dateVal,
      queueDate: dateVal,
    })
  } catch (err) {
    console.error('Error creating waiting list entry:', err)
    res.status(500).json({ error: 'Failed to create waiting list entry' })
  }
})

router.put('/waiting-list/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status, consultancyType, timeSlot } = req.body
    let statusVal = 0
    if (typeof status === 'number') {
      statusVal = status
    } else if (status === 'In Consultation') {
      statusVal = 1
    } else if (status === 'Completed') {
      statusVal = 2
    }

    if (consultancyType) {
      await query('UPDATE WaitingList SET Status = ?, ConsultancyType = ? WHERE ID = ?', [statusVal, consultancyType, id])
    } else {
      await query('UPDATE WaitingList SET Status = ? WHERE ID = ?', [statusVal, id])
    }

    res.json({ id, status, statusVal })
  } catch (err) {
    console.error('Error updating waiting list entry:', err)
    res.status(500).json({ error: 'Failed to update waiting list entry' })
  }
})

router.delete('/waiting-list/:id', async (req, res) => {
  try {
    const { id } = req.params
    await query('DELETE FROM WaitingList WHERE ID = ?', [id])
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting waiting list entry:', err)
    res.status(500).json({ error: 'Failed to delete waiting list entry' })
  }
})

// =====================================================================
// 8. ANNOUNCEMENTS APIS (Digital Signage / TV Display Feature)
// =====================================================================
router.get('/announcements', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM Announcements WHERE IsActive = 1 ORDER BY Priority DESC, ID DESC')
    const announcements = rows.map((r) => ({
      id: String(r.ID),
      headline: r.Headline || '',
      text: r.Message || '',
      message: r.Message || '',
      tag: r.Category || 'Chamber Advisory',
      category: r.Category || 'Chamber Advisory',
      priority: r.Priority || 'Normal',
      date: r.NoticeDate || 'Today',
      noticeDate: r.NoticeDate || 'Today',
      isActive: Boolean(r.IsActive),
    }))
    res.json(announcements)
  } catch (err) {
    console.error('Error fetching announcements:', err)
    res.status(500).json({ error: 'Failed to fetch announcements' })
  }
})

router.post('/announcements', async (req, res) => {
  try {
    const { headline, text, message, tag, category, priority, date, noticeDate } = req.body
    const headVal = (headline || '').trim()
    const msgVal = (text || message || '').trim()
    const catVal = tag || category || 'Chamber Advisory'
    const prioVal = priority || 'Normal'
    const dateVal = noticeDate || date || new Date().toISOString().split('T')[0]

    const result = await query(
      'INSERT INTO Announcements (Headline, Message, Category, Priority, NoticeDate, IsActive) VALUES (?, ?, ?, ?, ?, 1)',
      [headVal, msgVal, catVal, prioVal, dateVal]
    )

    res.status(201).json({
      id: String(result.insertId),
      headline: headVal,
      text: msgVal,
      message: msgVal,
      tag: catVal,
      category: catVal,
      priority: prioVal,
      date: dateVal,
      noticeDate: dateVal,
      isActive: true,
    })
  } catch (err) {
    console.error('Error saving announcement:', err)
    res.status(500).json({ error: 'Failed to save announcement' })
  }
})

router.delete('/announcements/:id', async (req, res) => {
  try {
    const { id } = req.params
    await query('DELETE FROM Announcements WHERE ID = ?', [id])
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting announcement:', err)
    res.status(500).json({ error: 'Failed to delete announcement' })
  }
})

// =====================================================================
// 9. DIRECT CONSULTANCY FEES APIS (NO CASE ID)
// Pure chamber advice fees recorded directly in ClientMaster & Payment
// =====================================================================
router.get('/consultancy-fees', async (req, res) => {
  try {
    const rows = await query(`
      SELECT ID, ClientName, So, Address, PhoneNo, RefName, RefPhNo, ConFees, ClientDate, created_at
      FROM ClientMaster
      WHERE ConFees > 0
      ORDER BY ID DESC
    `)
    const fees = rows.map((r) => ({
      id: `CF-${r.ID}`,
      dbId: r.ID,
      receiptNo: `REC-CF-${r.ID}`,
      clientName: r.ClientName || '',
      phone: r.PhoneNo || '',
      consultationDate: r.ClientDate || (r.created_at ? String(r.created_at).split(' ')[0].split('T')[0] : ''),
      amount: Number(r.ConFees || 0),
      paymentMode: r.RefName || 'Cash',
      remarks: r.Address || '',
      createdAt: r.created_at,
    }))
    res.json(fees)
  } catch (err) {
    console.error('Error fetching consultancy fees:', err)
    res.status(500).json({ error: 'Failed to fetch consultancy fees' })
  }
})

router.post('/consultancy-fees', async (req, res) => {
  try {
    const { clientName, phone, consultationDate, amount, paymentMode, remarks } = req.body
    const dateVal = consultationDate || new Date().toISOString().split('T')[0]
    const amountVal = Number(amount || 0)
    const modeVal = paymentMode || 'Cash'
    const remarksVal = remarks || ''

    // Duplicate check: Same clientName & amount within 5 seconds
    const [recent] = await query(
      `SELECT ID, ClientName, PhoneNo, ConFees, ClientDate 
       FROM ClientMaster 
       WHERE ClientName = ? AND ConFees = ? 
         AND created_at >= NOW() - INTERVAL 5 SECOND
       ORDER BY ID DESC LIMIT 1`,
      [clientName, amountVal]
    )
    if (recent) {
      return res.status(200).json({
        id: `CF-${recent.ID}`,
        dbId: recent.ID,
        receiptNo: `REC-CF-${recent.ID}`,
        clientName,
        phone,
        consultationDate: dateVal,
        amount: amountVal,
        paymentMode: modeVal,
        remarks: remarksVal,
        duplicatePrevented: true,
      })
    }

    // Insert into ClientMaster with ConFees
    const result = await query(
      `INSERT INTO ClientMaster (ClientName, PhoneNo, ConFees, ClientDate, RefName, Address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [clientName, phone || '', amountVal, dateVal, modeVal, remarksVal]
    )
    const newDbId = result.insertId

    // Record in Payment table for practice financials & collection reports
    await query(
      `INSERT INTO Payment (ClientId, PaymentDate, Amount, Details)
       VALUES (?, ?, ?, ?)`,
      [newDbId, dateVal, amountVal, `Consultancy Fee (Direct Advice): ${remarksVal || modeVal}`]
    )

    res.status(201).json({
      id: `CF-${newDbId}`,
      dbId: newDbId,
      receiptNo: `REC-CF-${newDbId}`,
      clientName,
      phone,
      consultationDate: dateVal,
      amount: amountVal,
      paymentMode: modeVal,
      remarks: remarksVal,
    })
  } catch (err) {
    console.error('Error saving consultancy fee:', err)
    res.status(500).json({ error: 'Failed to save consultancy fee' })
  }
})

router.put('/consultancy-fees/:id', async (req, res) => {
  try {
    const { id } = req.params
    const dbId = parseInt(String(id).replace(/\D/g, ''), 10) || id
    const { clientName, phone, consultationDate, amount, paymentMode, remarks } = req.body

    const updates = []
    const params = []
    if (clientName !== undefined) { updates.push('ClientName = ?'); params.push(clientName) }
    if (phone !== undefined) { updates.push('PhoneNo = ?'); params.push(phone) }
    if (consultationDate !== undefined) { updates.push('ClientDate = ?'); params.push(consultationDate) }
    if (amount !== undefined) { updates.push('ConFees = ?'); params.push(Number(amount)) }
    if (paymentMode !== undefined) { updates.push('RefName = ?'); params.push(paymentMode) }
    if (remarks !== undefined) { updates.push('Address = ?'); params.push(remarks) }

    if (updates.length > 0) {
      params.push(dbId)
      await query(`UPDATE ClientMaster SET ${updates.join(', ')} WHERE ID = ?`, params)

      // Synchronize Payment record
      if (amount !== undefined || consultationDate !== undefined) {
        const payUpdates = []
        const payParams = []
        if (amount !== undefined) { payUpdates.push('Amount = ?'); payParams.push(Number(amount)) }
        if (consultationDate !== undefined) { payUpdates.push('PaymentDate = ?'); payParams.push(consultationDate) }
        payParams.push(dbId)
        await query(`UPDATE Payment SET ${payUpdates.join(', ')} WHERE ClientId = ? AND Details LIKE 'Consultancy Fee%'`, payParams)
      }
    }

    res.json({ success: true, id: `CF-${dbId}`, dbId })
  } catch (err) {
    console.error('Error updating consultancy fee:', err)
    res.status(500).json({ error: 'Failed to update consultancy fee' })
  }
})

router.delete('/consultancy-fees/:id', async (req, res) => {
  try {
    const { id } = req.params
    const dbId = parseInt(String(id).replace(/\D/g, ''), 10) || id
    await query('UPDATE ClientMaster SET ConFees = 0 WHERE ID = ?', [dbId])
    await query(`DELETE FROM Payment WHERE ClientId = ? AND Details LIKE 'Consultancy Fee%'`, [dbId])
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting consultancy fee:', err)
    res.status(500).json({ error: 'Failed to delete consultancy fee' })
  }
})

// =====================================================================
// 10. EXTRA BRIEF FOR COURT TO OTHER ADVOCATE (EVIDENCE) APIS
// Seamless persistence with clientinformation logging and persistent storage
// =====================================================================
const EXTRA_BRIEFS_FILE = path.join(DATA_DIR, 'extra_briefs.json')

router.get('/extra-briefs', async (req, res) => {
  try {
    const briefs = readJsonFile(EXTRA_BRIEFS_FILE, [])
    res.json(briefs)
  } catch (err) {
    console.error('Error fetching extra briefs:', err)
    res.status(500).json({ error: 'Failed to fetch extra briefs' })
  }
})

router.post('/extra-briefs', async (req, res) => {
  try {
    const { clientName, hasIdNumber, idNumber, advocateLawClerk, courtName, caseNumber, date, evidenceDetails, remarks } = req.body
    const briefs = readJsonFile(EXTRA_BRIEFS_FILE, [])
    
    let maxNum = 8000
    briefs.forEach((b) => {
      const match = String(b.id).match(/\d+/)
      if (match) {
        const num = parseInt(match[0], 10)
        if (num > maxNum) maxNum = num
      }
    })
    const newId = `EB-${maxNum + 1}`

    const newBrief = {
      id: newId,
      clientName: (clientName || '').trim(),
      hasIdNumber: !!hasIdNumber,
      idNumber: hasIdNumber ? String(idNumber || '').trim() : '',
      advocateLawClerk: (advocateLawClerk || '').trim(),
      courtName: (courtName || '').trim(),
      caseNumber: (caseNumber || '').trim(),
      date: date || new Date().toISOString().split('T')[0],
      evidenceDetails: (evidenceDetails || '').trim(),
      remarks: (remarks || '').trim(),
      createdAt: new Date().toISOString(),
    }

    const updated = [newBrief, ...briefs]
    writeJsonFile(EXTRA_BRIEFS_FILE, updated)

    // Log to clientinformation table in MySQL
    try {
      const parsedClientId = newBrief.idNumber ? parseInt(String(newBrief.idNumber).replace(/\D/g, ''), 10) || null : null
      const note = `EXTRA_BRIEF: ${newBrief.advocateLawClerk} | ${newBrief.courtName} | ${newBrief.caseNumber} | ${newBrief.evidenceDetails} | ${newBrief.remarks}`.slice(0, 255)
      await query('INSERT INTO clientinformation (ClientId, CallDate, Details) VALUES (?, ?, ?)', [
        parsedClientId,
        newBrief.date,
        note
      ])
    } catch (logErr) {
      console.warn('Logging extra brief to clientinformation:', logErr.message)
    }

    res.status(201).json(newBrief)
  } catch (err) {
    console.error('Error saving extra brief:', err)
    res.status(500).json({ error: 'Failed to save extra brief' })
  }
})

router.put('/extra-briefs/:id', async (req, res) => {
  try {
    const { id } = req.params
    const briefs = readJsonFile(EXTRA_BRIEFS_FILE, [])
    const idx = briefs.findIndex((b) => String(b.id).toLowerCase() === String(id).toLowerCase())
    if (idx === -1) {
      return res.status(404).json({ error: `Extra brief ${id} not found` })
    }

    const updatedBrief = {
      ...briefs[idx],
      ...req.body,
      id,
      hasIdNumber: !!req.body.hasIdNumber,
      idNumber: req.body.hasIdNumber ? String(req.body.idNumber || '').trim() : '',
      updatedAt: new Date().toISOString(),
    }

    briefs[idx] = updatedBrief
    writeJsonFile(EXTRA_BRIEFS_FILE, briefs)
    res.json(updatedBrief)
  } catch (err) {
    console.error('Error updating extra brief:', err)
    res.status(500).json({ error: 'Failed to update extra brief' })
  }
})

router.delete('/extra-briefs/:id', async (req, res) => {
  try {
    const { id } = req.params
    const briefs = readJsonFile(EXTRA_BRIEFS_FILE, [])
    const filtered = briefs.filter((b) => String(b.id).toLowerCase() !== String(id).toLowerCase())
    writeJsonFile(EXTRA_BRIEFS_FILE, filtered)
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting extra brief:', err)
    res.status(500).json({ error: 'Failed to delete extra brief' })
  }
})

// =====================================================================
// 11. ID-WISE DOCUMENT UPLOAD SYSTEM APIS
// Secure filesystem storage with JSON metadata catalog & MySQL audit trail
// =====================================================================
const DOCUMENTS_FILE = path.join(DATA_DIR, 'documents.json')

router.get('/documents', async (req, res) => {
  try {
    const { filterId } = req.query
    const docs = readJsonFile(DOCUMENTS_FILE, [])
    if (!filterId) {
      return res.json(docs)
    }
    const f = String(filterId).toLowerCase()
    const filtered = docs.filter((d) =>
      String(d.associatedId || '').toLowerCase() === f ||
      String(d.idNumber || '').toLowerCase() === f
    )
    res.json(filtered)
  } catch (err) {
    console.error('Error fetching documents:', err)
    res.status(500).json({ error: 'Failed to fetch documents' })
  }
})

router.get('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params
    const docs = readJsonFile(DOCUMENTS_FILE, [])
    const found = docs.find((d) => String(d.id).toLowerCase() === String(id).toLowerCase())
    if (!found) {
      return res.status(404).json({ error: `Document ${id} not found` })
    }

    // If fileData is not stored directly in JSON, read from disk if available
    let fileData = found.fileData || null
    if (!fileData && found.fileName) {
      const diskPath = path.join(UPLOADS_DOCS_DIR, found.fileName)
      if (fs.existsSync(diskPath)) {
        const buffer = fs.readFileSync(diskPath)
        const mime = found.fileType || 'application/octet-stream'
        fileData = `data:${mime};base64,${buffer.toString('base64')}`
      }
    }

    res.json({ ...found, fileData })
  } catch (err) {
    console.error('Error fetching document details:', err)
    res.status(500).json({ error: 'Failed to fetch document' })
  }
})

router.post('/documents', async (req, res) => {
  try {
    const { entityType, associatedId, idNumber, docName, docType, fileSize, fileType, fileData, remarks } = req.body
    const docs = readJsonFile(DOCUMENTS_FILE, [])

    let maxNum = 6000
    docs.forEach((d) => {
      const match = String(d.id).match(/\d+/)
      if (match) {
        const num = parseInt(match[0], 10)
        if (num > maxNum) maxNum = num
      }
    })
    const newId = `DOC-${maxNum + 1}`

    const now = new Date()
    const dateStr = `${now.toISOString().split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    // Save binary file to uploads directory if provided
    let savedFileName = null
    let downloadUrl = '#'
    if (fileData && typeof fileData === 'string' && fileData.startsWith('data:')) {
      try {
        const matches = fileData.match(/^data:([^;]+);base64,(.+)$/)
        if (matches) {
          const extension = (docName || '').split('.').pop() || 'bin'
          const safeName = `${newId}_${Date.now()}.${extension}`
          const diskPath = path.join(UPLOADS_DOCS_DIR, safeName)
          fs.writeFileSync(diskPath, Buffer.from(matches[2], 'base64'))
          savedFileName = safeName
          downloadUrl = `/uploads/documents/${safeName}`
        }
      } catch (fileErr) {
        console.warn('Saving file to disk:', fileErr.message)
      }
    }

    const docRecord = {
      id: newId,
      entityType: entityType || 'case',
      associatedId: associatedId || '',
      idNumber: idNumber || '',
      docName: docName || 'Untitled_Document',
      docType: docType || 'Court Document',
      fileSize: fileSize || 0,
      fileType: fileType || 'application/pdf',
      uploadDate: dateStr,
      remarks: remarks || '',
      fileName: savedFileName,
      downloadUrl: downloadUrl !== '#' ? downloadUrl : fileData || '#',
      fileData: fileData || null,
    }

    const updated = [docRecord, ...docs]
    writeJsonFile(DOCUMENTS_FILE, updated)

    // Log to clientinformation table in MySQL
    try {
      const parsedClientId = associatedId ? parseInt(String(associatedId).replace(/\D/g, ''), 10) || null : null
      const note = `DOC_UPLOAD: ${docRecord.docName} (${docRecord.docType})`.slice(0, 255)
      await query('INSERT INTO clientinformation (ClientId, CallDate, Details) VALUES (?, ?, ?)', [
        parsedClientId,
        dateStr.split(' ')[0],
        note
      ])
    } catch (logErr) {
      console.warn('Logging document upload to clientinformation:', logErr.message)
    }

    res.status(201).json(docRecord)
  } catch (err) {
    console.error('Error saving document:', err)
    res.status(500).json({ error: 'Failed to upload document' })
  }
})

router.delete('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params
    const docs = readJsonFile(DOCUMENTS_FILE, [])
    const found = docs.find((d) => String(d.id).toLowerCase() === String(id).toLowerCase())
    if (found && found.fileName) {
      const diskPath = path.join(UPLOADS_DOCS_DIR, found.fileName)
      if (fs.existsSync(diskPath)) {
        try { fs.unlinkSync(diskPath) } catch (e) {}
      }
    }

    const filtered = docs.filter((d) => String(d.id).toLowerCase() !== String(id).toLowerCase())
    writeJsonFile(DOCUMENTS_FILE, filtered)
    res.json({ success: true, id })
  } catch (err) {
    console.error('Error deleting document:', err)
    res.status(500).json({ error: 'Failed to delete document' })
  }
})

// =====================================================================
// 12. COMPLETE SYSTEM DATA SYNC API
// Returns full database snapshot in a single fast call for UI initialization
// =====================================================================
router.get('/sync', async (req, res) => {
  try {
    const [clientsRaw, casesRaw, remindersRaw, billsRaw, paymentsRaw, headsRaw, expensesRaw, waitingRaw, announcementsRaw] = await Promise.all([
      query('SELECT * FROM ClientMaster ORDER BY ID DESC'),
      query(`
        SELECT c.*, cl.ClientName, cl.PhoneNo as ClientPhone,
          (SELECT NextDate FROM CaseNext cn WHERE cn.CaseId = c.ID ORDER BY cn.ID DESC LIMIT 1) as NextDate,
          (SELECT cn.For FROM CaseNext cn WHERE cn.CaseId = c.ID ORDER BY cn.ID DESC LIMIT 1) as NextFor,
          (SELECT cn.CourtName FROM CaseNext cn WHERE cn.CaseId = c.ID ORDER BY cn.ID DESC LIMIT 1) as NextCourt
        FROM CaseMaster c
        LEFT JOIN ClientMaster cl ON c.ClientId = cl.ID
        ORDER BY c.ID DESC
      `),
      query(`
        SELECT cn.*, c.CaseNo, c.VersusName, cl.ClientName, cl.PhoneNo
        FROM CaseNext cn
        LEFT JOIN CaseMaster c ON cn.CaseId = c.ID
        LEFT JOIN ClientMaster cl ON c.ClientId = cl.ID
        ORDER BY cn.ID DESC
        LIMIT 300
      `),
      query('SELECT b.*, cl.ClientName FROM Billing b LEFT JOIN ClientMaster cl ON b.ClientId = cl.ID ORDER BY b.ID DESC LIMIT 300'),
      query('SELECT p.*, cl.ClientName FROM Payment p LEFT JOIN ClientMaster cl ON p.ClientId = cl.ID ORDER BY p.ID DESC LIMIT 300'),
      query('SELECT * FROM ExpenseHeadMaster ORDER BY ExpenseHead ASC'),
      query(`
        SELECT e.*, ehm.ExpenseHead as HeadName
        FROM Expense e
        LEFT JOIN ExpenseHeadMaster ehm ON e.ExpenseId = ehm.ID
        ORDER BY e.ID DESC
        LIMIT 300
      `),
      query('SELECT * FROM WaitingList ORDER BY ID ASC'),
      query('SELECT * FROM Announcements WHERE IsActive = 1 ORDER BY Priority DESC, ID DESC')
    ])

    const clients = clientsRaw.map((r) => ({
      id: String(r.ID),
      name: r.ClientName || '',
      relation: r.So || '',
      address: r.Address || '',
      phone: r.PhoneNo || '',
      extraPhone: '',
      referenceName: r.RefName || '',
      referencePhone: r.RefPhNo || '',
      fees: Number(r.ConFees || 0),
      date: r.ClientDate || '',
      createdAt: r.created_at,
    }))

    const cases = casesRaw.map((r) => ({
      id: String(r.ID),
      clientId: r.ClientId ? String(r.ClientId) : '',
      clientName: r.ClientName || '',
      phone: r.ClientPhone || '',
      caseNo: r.CaseNo || '',
      psCaseNo: r.PsCaseNo || '',
      courtName: r.CourtName || '',
      startDate: r.StartDate || '',
      ppName: r.PPName || '',
      psCaseDate: r.PsCaseDate || '',
      rackNo: r.RackNo || '',
      roomNo: r.RoomNo || '',
      underSection: r.Us || '',
      caseFor: r.For || '',
      lcName: r.LcName || '',
      versusName: r.VersusName || '',
      adAdvName: r.AdAdvName || '',
      caseDetails: r.CaseDetails || '',
      nextDate: r.NextDate || '',
      nextFor: r.NextFor || '',
      nextCourt: r.NextCourt || '',
    }))

    const reminders = remindersRaw.map((r) => ({
      id: String(r.ID),
      caseId: r.CaseId ? String(r.CaseId) : '',
      caseNo: r.CaseNo || '',
      clientName: r.ClientName || '',
      phone: r.PhoneNo || '',
      nextDate: r.NextDate || '',
      hearingDate: r.NextDate || '',
      date: r.NextDate || '',
      for: r.For || '',
      stage: r.For || '',
      reasons: r.For || '',
      courtName: r.CourtName || '',
      ppName: r.PPName || '',
      otherAc: r.OtherAc || '',
      notes: r.OtherAc || '',
      status: 'Active',
    }))

    const bills = billsRaw.map((r) => ({
      id: String(r.ID),
      billNumber: `BILL-${r.ID}`,
      billNo: String(r.ID),
      billDate: r.BillingDate ? String(r.BillingDate).split(' ')[0] : '',
      date: r.BillingDate || '',
      billingDate: r.BillingDate || '',
      clientId: r.ClientId ? String(r.ClientId) : '',
      clientName: r.ClientName || '',
      amount: Number(r.Amount || 0),
      totalAmount: Number(r.Amount || 0),
      totalBillAmount: Number(r.Amount || 0),
      contractAmount: Number(r.Amount || 0),
      particulars: r.Details || '',
      details: r.Details || '',
      description: r.Details || '',
    }))

    const payments = paymentsRaw.map((r) => ({
      id: String(r.ID),
      receiptNo: `REC-${r.ID}`,
      receiptNumber: `REC-${r.ID}`,
      clientId: r.ClientId ? String(r.ClientId) : '',
      clientName: r.ClientName || '',
      date: r.PaymentDate ? String(r.PaymentDate).split(' ')[0] : '',
      paymentDate: r.PaymentDate ? String(r.PaymentDate).split(' ')[0] : '',
      amount: Number(r.Amount || 0),
      paidAmount: Number(r.Amount || 0),
      remarks: r.Details || '',
      details: r.Details || '',
      paymentMode: r.Details || 'Cash',
    }))

    const expenseHeads = headsRaw.map((r) => ({
      id: String(r.ID),
      name: r.ExpenseHead || '',
      expenseHead: r.ExpenseHead || '',
    }))

    const expenses = expensesRaw.map((r) => ({
      id: String(r.ID),
      headId: r.ExpenseId ? String(r.ExpenseId) : '',
      expenseId: r.ExpenseId ? String(r.ExpenseId) : '',
      headName: r.HeadName || '',
      paidTo: r.PaidTo || '',
      date: r.ExpenseDate || '',
      expenseDate: r.ExpenseDate || '',
      amount: Number(r.Amount || 0),
      remarks: r.Details || '',
      details: r.Details || '',
    }))

    const waitingList = waitingRaw.map((r) => ({
      id: String(r.ID),
      name: r.Name || '',
      clientName: r.Name || '',
      status: r.Status === 1 ? 'In Consultation' : r.Status === 2 ? 'Completed' : 'Waiting',
      statusCode: r.Status,
      address: r.Address || '',
      phoneNo: r.PhoneNo || '',
      mobile: r.PhoneNo || '',
      timeSlot: r.TimeSlot || '',
      consultancyType: r.ConsultancyType || 'Conference',
      date: r.QueueDate || '',
      queueDate: r.QueueDate || '',
    }))

    const announcements = announcementsRaw.map((r) => ({
      id: String(r.ID),
      headline: r.Headline || '',
      text: r.Message || '',
      message: r.Message || '',
      tag: r.Category || 'Chamber Advisory',
      category: r.Category || 'Chamber Advisory',
      priority: r.Priority || 'Normal',
      date: r.NoticeDate || 'Today',
      noticeDate: r.NoticeDate || 'Today',
      isActive: Boolean(r.IsActive),
    }))

    const consultancyFees = clientsRaw
      .filter((r) => Number(r.ConFees || 0) > 0)
      .map((r) => ({
        id: `CF-${r.ID}`,
        dbId: r.ID,
        receiptNo: `REC-CF-${r.ID}`,
        clientName: r.ClientName || '',
        phone: r.PhoneNo || '',
        consultationDate: r.ClientDate || (r.created_at ? String(r.created_at).split(' ')[0].split('T')[0] : ''),
        amount: Number(r.ConFees || 0),
        paymentMode: r.RefName || 'Cash',
        remarks: r.Address || '',
        createdAt: r.created_at,
      }))

    const extraBriefs = readJsonFile(EXTRA_BRIEFS_FILE, [])
    const documents = readJsonFile(DOCUMENTS_FILE, [])

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      counts: {
        clients: clients.length,
        cases: cases.length,
        reminders: reminders.length,
        bills: bills.length,
        payments: payments.length,
        expenseHeads: expenseHeads.length,
        expenses: expenses.length,
        waitingList: waitingList.length,
        announcements: announcements.length,
        consultancyFees: consultancyFees.length,
        extraBriefs: extraBriefs.length,
        documents: documents.length,
      },
      data: {
        clients,
        cases,
        reminders,
        bills,
        payments,
        expenseHeads,
        expenses,
        waitingList,
        announcements,
        consultancyFees,
        extraBriefs,
        documents,
      }
    })
  } catch (err) {
    console.error('Sync Error:', err)
    res.status(500).json({ error: 'Failed to synchronize system data' })
  }
})

// =====================================================================
// 10. REAL-TIME PRACTICE OVERVIEW METRICS API
// Instant SQL aggregation directly from MySQL legalcase_db
// =====================================================================
router.get('/overview', async (req, res) => {
  try {
    const [clientRow] = await query('SELECT COUNT(*) as count, COALESCE(SUM(ConFees), 0) as totalConFees FROM ClientMaster')
    const [caseRow] = await query('SELECT COUNT(*) as count FROM CaseMaster')
    const [billingRow] = await query('SELECT COALESCE(SUM(Amount), 0) as totalBilling FROM Billing')
    const [paymentRow] = await query('SELECT COALESCE(SUM(Amount), 0) as totalPayment FROM Payment')
    const [expenseRow] = await query('SELECT COALESCE(SUM(Amount), 0) as totalExpense FROM Expense')

    res.json({
      success: true,
      data: {
        totalClients: Number(clientRow?.count || 0),
        totalCases: Number(caseRow?.count || 0),
        totalBilling: Number(billingRow?.totalBilling || 0),
        totalPayment: Number(paymentRow?.totalPayment || 0),
        totalExpense: Number(expenseRow?.totalExpense || 0),
        totalConsultancy: Number(clientRow?.totalConFees || 0),
      }
    })
  } catch (err) {
    console.error('Overview Error:', err)
    res.status(500).json({ error: 'Failed to fetch practice overview metrics' })
  }
})

module.exports = router
