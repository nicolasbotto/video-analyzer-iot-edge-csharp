using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace SampleApp.Helpers
{
    public static class AppConstants
    {
        private static Dictionary<string, CancellationTokenSource> tokens = new Dictionary<string, CancellationTokenSource>();
        public static Dictionary<string, CancellationTokenSource> TokenSource { 
            get 
            { 
                return tokens; 
            } 
        }
    }
}
