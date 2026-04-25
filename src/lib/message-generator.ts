import type { Business } from "@/types"

export function generateMessages(business: Business): string[] {
  const messages: string[] = []
  const name = business.name
  const category = business.category
  const rating = business.rating

  messages.push(
    `Merhaba! Google Haritalar'da ${category} araması yaparken ${name} işletmenizi gördük. Dijital varlığınızı güçlendirmek ve daha fazla müşteriye ulaşmanıza yardımcı olmak isteriz. Kısa bir görüşme ayarlayabilir miyiz?`
  )

  if (rating != null) {
    messages.push(
      `Merhaba ${name}! Google'da işletmenizi inceledik. Online varlığınızı daha da güçlendirmek ve ${rating.toFixed(1)} yıldızlık puanınızı öne çıkarmak için bir önerimiz var. Müsait misiniz?`
    )
  } else {
    messages.push(
      `Merhaba ${name}! Google'da işletmenizi inceledik. Online varlığınızı daha da güçlendirmek için bir önerimiz var. Müsait misiniz?`
    )
  }

  if (rating != null && rating > 4.3) {
    messages.push(
      `Merhaba! ${name} için ${rating.toFixed(1)} yıldız aldığınızı gördük, tebrikler! Bu başarıyı daha geniş kitlelere taşımak için birlikte çalışabilir miyiz?`
    )
  } else {
    messages.push(
      `Merhaba! ${name} işletmenizi Google Haritalar'da keşfettik. Sizi daha fazla müşteriye ulaştırmak için özel bir teklifimiz var. Detayları paylaşabilir miyiz?`
    )
  }

  return messages
}
