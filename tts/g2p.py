import re, phonemizer, espeakng_loader
from phonemizer.backend.espeak.wrapper import EspeakWrapper
EspeakWrapper.set_data_path(espeakng_loader.get_data_path()); EspeakWrapper.set_library(espeakng_loader.get_library_path())
from phonemizer.backend import EspeakBackend
BE = EspeakBackend('en-us', preserve_punctuation=True, with_stress=True, tie='^', language_switch='remove-flags')
E2M = sorted({'ʔˌn̩':'tᵊn','ʔn̩':'tᵊn','ʔn':'tᵊn','ʔ':'t','a^ɪ':'I','a^ʊ':'W','d^ʒ':'ʤ','e':'A','e^ɪ':'A','r':'ɹ','t^ʃ':'ʧ','x':'k','ç':'k','ɐ':'ə','ɔ^ɪ':'Y','ə^l':'ᵊl','ɚ':'əɹ','ɬ':'l','ʲ':'','ʲO':'jO','ʲQ':'jQ'}.items(), key=lambda kv:-len(kv[0]))
def g2p(text):
    ps = BE.phonemize([text])[0].strip()
    for o,n in E2M: ps = ps.replace(o,n)
    ps = re.sub(r'(\S)̩', r'ᵊ\1', ps).replace('̩','')
    ps = ps.replace('o^ʊ','O').replace('ɜːɹ','ɜɹ').replace('ɜː','ɜɹ').replace('ɪə','iə').replace('ː','')
    return ps.replace('^','')
OVERRIDE = {'bow':'bˈW'}
