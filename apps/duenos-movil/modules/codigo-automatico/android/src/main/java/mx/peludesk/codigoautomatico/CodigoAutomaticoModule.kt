package mx.peludesk.codigoautomatico

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import androidx.core.content.ContextCompat
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Leer solo el código de entrada, sin pedir permisos:
 *  - WhatsApp: el «saludo» avisa a WhatsApp que esta app espera un código; el botón «Autocompletar» de la plantilla de
 *    autenticación lo entrega a CodigoDeWhatsAppReceiver.
 *  - SMS: el SMS Retriever de Google entrega el SMS que termina con la huella de la app.
 * Si algo falta (sin WhatsApp, sin servicios de Google), no pasa nada: la persona lo escribe a mano.
 */
class CodigoAutomaticoModule : Module() {
  private var receptorSms: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("CodigoAutomatico")
    Events("onCodigo")

    OnCreate {
      CodigoDeWhatsAppReceiver.alRecibir = { codigo -> sendEvent("onCodigo", Bundle().apply { putString("codigo", codigo); putString("origen", "whatsapp") }) }
    }
    OnDestroy {
      CodigoDeWhatsAppReceiver.alRecibir = null
      quitarReceptorSms()
    }

    Function("saludarWhatsApp") {
      val contexto = appContext.reactContext ?: return@Function false
      val ci = PendingIntent.getBroadcast(contexto, 0, Intent(), PendingIntent.FLAG_IMMUTABLE)
      for (paquete in listOf("com.whatsapp", "com.whatsapp.w4b")) {
        contexto.sendBroadcast(Intent("com.whatsapp.otp.OTP_REQUESTED").setPackage(paquete).putExtra("_ci_", ci))
      }
      true
    }

    Function("esperarSms") {
      val contexto = appContext.reactContext ?: return@Function false
      quitarReceptorSms()
      val receptor = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          if (intent.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
          val extras = intent.extras ?: return
          @Suppress("DEPRECATION")
          val estado = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
          if (estado.statusCode != CommonStatusCodes.SUCCESS) return
          val texto = extras.getString(SmsRetriever.EXTRA_SMS_MESSAGE) ?: return
          val codigo = Regex("\\b(\\d{6})\\b").find(texto)?.groupValues?.get(1) ?: return
          sendEvent("onCodigo", Bundle().apply { putString("codigo", codigo); putString("origen", "sms") })
        }
      }
      ContextCompat.registerReceiver(contexto, receptor, IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION), SmsRetriever.SEND_PERMISSION, null, ContextCompat.RECEIVER_EXPORTED)
      receptorSms = receptor
      SmsRetriever.getClient(contexto).startSmsRetriever()
      true
    }

    Function("dejarDeEsperar") { quitarReceptorSms() }
  }

  private fun quitarReceptorSms() {
    val contexto = appContext.reactContext
    val receptor = receptorSms
    if (contexto != null && receptor != null) runCatching { contexto.unregisterReceiver(receptor) }
    receptorSms = null
  }
}

class CodigoDeWhatsAppReceiver : BroadcastReceiver() {
  companion object {
    var alRecibir: ((String) -> Unit)? = null
    private val PAQUETES = setOf("com.whatsapp", "com.whatsapp.w4b")
  }

  override fun onReceive(contexto: Context, intent: Intent) {
    // Solo WhatsApp: el PendingIntent que manda dice de qué app viene de verdad.
    val ci = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) intent.getParcelableExtra("_ci_", PendingIntent::class.java)
    else @Suppress("DEPRECATION") intent.getParcelableExtra("_ci_") as? PendingIntent
    if (ci?.creatorPackage !in PAQUETES) return
    val codigo = intent.getStringExtra("code")?.filter { it.isDigit() }?.take(6) ?: return
    if (codigo.length == 6) alRecibir?.invoke(codigo)
  }
}
