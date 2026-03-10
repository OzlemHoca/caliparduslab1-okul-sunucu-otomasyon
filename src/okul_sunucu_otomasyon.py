#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Okul Sunucu Otomasyon - İlk Prototip
ÇalıPardusLab1 / Pardus Hata Yakalama ve Öneri Yarışması 2026

Bu sürüm, okul sunucusunda kullanıcı ve klasör yapısı hazırlama mantığını
göstermek amacıyla hazırlanmış simülasyon tabanlı ilk prototiptir.
Gerçek sistemde kullanıcı açmaz; örnek çıktı üretir.
"""

from pathlib import Path


OGRETMENLER = ["ogretmen_matematik", "ogretmen_fizik"]
OGRENCILER = ["ogrenci_9a_01", "ogrenci_9a_02", "ogrenci_10b_01"]
DERSLER = ["Matematik", "Fizik", "Bilişim"]


def baslik_yaz() -> None:
    print("=" * 65)
    print("PARDUS OKUL SUNUCU OTOMASYON")
    print("=" * 65)
    print("Kullanıcı, klasör ve paylaşım yapısı için örnek otomasyon aracı\n")


def kullanicilari_listele() -> None:
    print("\n[Öğretmen Listesi]")
    for ogretmen in OGRETMENLER:
        print(f"- {ogretmen}")

    print("\n[Öğrenci Listesi]")
    for ogrenci in OGRENCILER:
        print(f"- {ogrenci}")
    print()


def dersleri_listele() -> None:
    print("\n[Ders Klasörleri]")
    for ders in DERSLER:
        print(f"- {ders}")
    print()


def klasor_yapisi_simulasyonu() -> None:
    print("\n[Klasör Yapısı Simülasyonu]")
    ana_dizin = Path("/okul_sunucusu")

    for ders in DERSLER:
        print(f"Oluşturulacak ders klasörü: {ana_dizin / 'dersler' / ders}")

    for ogretmen in OGRETMENLER:
        print(f"Oluşturulacak öğretmen klasörü: {ana_dizin / 'ogretmenler' / ogretmen}")

    for ogrenci in OGRENCILER:
        print(f"Oluşturulacak öğrenci klasörü: {ana_dizin / 'ogrenciler' / ogrenci}")

    print()


def paylasim_yapisi_simulasyonu() -> None:
    print("\n[Paylaşım Yapısı Simülasyonu]")
    print("- Öğretmenler ders klasörlerine yazabilir.")
    print("- Öğrenciler kendi klasörlerine yazabilir.")
    print("- Öğrenciler ders klasörlerini salt okunur görebilir.")
    print("- Ortak materyal klasörü tüm kullanıcılar tarafından görüntülenebilir.\n")


def sistem_ozeti() -> None:
    print("\n[Sistem Özeti]")
    print(f"Öğretmen sayısı : {len(OGRETMENLER)}")
    print(f"Öğrenci sayısı  : {len(OGRENCILER)}")
    print(f"Ders sayısı     : {len(DERSLER)}")
    print("Çalışma modu    : Simülasyon")
    print()


def menu_goster() -> None:
    print("Lütfen bir işlem seçin:")
    print("1 - Kullanıcıları listele")
    print("2 - Dersleri listele")
    print("3 - Klasör yapısı simülasyonu")
    print("4 - Paylaşım yapısı simülasyonu")
    print("5 - Sistem özeti")
    print("6 - Çıkış")
    print()


def ana_program() -> None:
    baslik_yaz()

    while True:
        menu_goster()
        secim = input("Seçiminiz: ").strip()

        if secim == "1":
            kullanicilari_listele()
        elif secim == "2":
            dersleri_listele()
        elif secim == "3":
            klasor_yapisi_simulasyonu()
        elif secim == "4":
            paylasim_yapisi_simulasyonu()
        elif secim == "5":
            sistem_ozeti()
        elif secim == "6":
            print("\nProgram sonlandırıldı.")
            break
        else:
            print("\nGeçersiz seçim yaptınız. Lütfen tekrar deneyin.\n")


if __name__ == "__main__":
    ana_program()
